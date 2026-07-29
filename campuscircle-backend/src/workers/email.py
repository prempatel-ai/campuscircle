"""
Email delivery worker module supporting Brevo API, SMTP Relay, Resend API, and local dev stub fallback.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from src.config import settings

logger = logging.getLogger(__name__)


def _send_via_brevo_api(to_email: str, subject: str, html_content: str) -> tuple[bool, str]:
    """
    Delivers email via Brevo REST HTTP API (https://api.brevo.com/v3/smtp/email).
    Uses standard HTTPS, bypassing all SMTP port blocking on cloud hosts.
    """
    if not settings.brevo_api_key or not settings.brevo_api_key.strip():
        return False, "BREVO_API_KEY not configured"

    sender_email = settings.from_email_address.strip() if settings.from_email_address else "no-reply@campuscircle.app"
    sender_name = "CampusCircle"

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html_content
    }

    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": settings.brevo_api_key.strip()
    }

    try:
        import httpx
        with httpx.Client(timeout=10.0) as client:
            response = client.post("https://api.brevo.com/v3/smtp/email", json=payload, headers=headers)
            if response.status_code in (200, 201, 202):
                logger.info(f"Email successfully sent to {to_email} via Brevo HTTP API.")
                return True, f"Delivered via Brevo API: {response.text}"
            else:
                err_msg = f"Brevo API returned status {response.status_code}: {response.text}"
                logger.error(err_msg)
                return False, err_msg
    except Exception as e:
        err_msg = f"Brevo API exception: {str(e)}"
        logger.error(err_msg, exc_info=True)
        return False, err_msg


def _send_via_smtp(to_email: str, subject: str, html_content: str, text_content: str) -> tuple[bool, str]:
    if not settings.smtp_username or not settings.smtp_password:
        return False, "SMTP credentials not configured"

    sender = settings.from_email_address.strip() or settings.smtp_username.strip()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    # Try SSL port 465 first
    try:
        with smtplib.SMTP_SSL(settings.smtp_server, 465, timeout=10) as server:
            server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
            server.sendmail(sender, [to_email], msg.as_string())
        logger.info(f"Email sent to {to_email} via SMTP SSL (port 465).")
        return True, "Delivered via SMTP SSL 465"
    except Exception as ssl_err:
        logger.warning(f"SMTP SSL 465 failed: {ssl_err}")

    # Try STARTTLS port 587
    try:
        with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
            server.sendmail(sender, [to_email], msg.as_string())
        logger.info(f"Email sent to {to_email} via STARTTLS (port {settings.smtp_port}).")
        return True, f"Delivered via SMTP STARTTLS {settings.smtp_port}"
    except Exception as e:
        err_msg = f"SMTP failed: {str(e)}"
        logger.error(err_msg, exc_info=True)
        return False, err_msg


def _send_via_resend(to_email: str, subject: str, html_content: str) -> tuple[bool, str]:
    if not settings.resend_api_key or not settings.resend_api_key.strip():
        return False, "RESEND_API_KEY not configured"

    try:
        import resend
        resend.api_key = settings.resend_api_key.strip()
        sender = settings.from_email_address.strip() or "onboarding@resend.dev"

        params: resend.Emails.SendParams = {
            "from": sender,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }

        response = resend.Emails.send(params)
        email_id = getattr(response, "id", None) or (response.get("id") if isinstance(response, dict) else "sent")
        logger.info(f"Email sent to {to_email} via Resend API. ID: {email_id}")
        return True, f"Delivered via Resend ID: {email_id}"
    except Exception as e:
        err_msg = f"Resend API exception: {str(e)}"
        logger.error(err_msg, exc_info=True)
        return False, err_msg


def diagnose_email_sending(to_email: str) -> dict:
    """
    Executes a test email send synchronously and returns detailed diagnostic results.
    """
    results = {
        "brevo_configured": bool(settings.brevo_api_key),
        "smtp_configured": bool(settings.smtp_username and settings.smtp_password),
        "resend_configured": bool(settings.resend_api_key),
        "methods_tried": [],
        "status": "pending",
        "details": ""
    }

    subject = "CampusCircle Email Delivery Test"
    text_content = "This is a test email from CampusCircle to verify email delivery configurations."
    html_content = "<h2>CampusCircle Email Test</h2><p>This is a test email confirming Brevo email delivery is active!</p>"

    # 1. Try Brevo API first
    if settings.brevo_api_key:
        results["methods_tried"].append("brevo_api")
        ok, msg = _send_via_brevo_api(to_email, subject, html_content)
        if ok:
            results["status"] = "success"
            results["details"] = msg
            return results
        results["brevo_error"] = msg

    # 2. Try SMTP second
    if settings.smtp_username and settings.smtp_password:
        results["methods_tried"].append("smtp")
        ok, msg = _send_via_smtp(to_email, subject, html_content, text_content)
        if ok:
            results["status"] = "success"
            results["details"] = msg
            return results
        results["smtp_error"] = msg

    # 3. Try Resend API third
    if settings.resend_api_key:
        results["methods_tried"].append("resend")
        ok, msg = _send_via_resend(to_email, subject, html_content)
        if ok:
            results["status"] = "success"
            results["details"] = msg
            return results
        results["resend_error"] = msg

    # Fallback to Stub
    results["methods_tried"].append("stub")
    results["status"] = "stubbed"
    results["details"] = (
        "No email service credentials (BREVO_API_KEY, SMTP_USERNAME, or RESEND_API_KEY) are configured on Render. "
        "The system logged the verification email to server logs."
    )
    return results


def send_verification_email(email: str, token: str) -> None:
    verification_link = f"{settings.frontend_url.rstrip('/')}/verify-pending?token={token}"
    subject = "Verify your CampusCircle Account"
    text_content = f"Welcome to CampusCircle! Please verify your email by opening this link: {verification_link}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #DADDD8; border-radius: 16px; background-color: #F5F6F4;">
      <h2 style="color: #2F5233; margin-top: 0;">Welcome to CampusCircle</h2>
      <p style="color: #14171A; font-size: 15px; line-height: 1.5;">
        Please click the link below to verify your academic email address and activate your campus account:
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="{verification_link}" style="background-color: #2F5233; color: #FFFFFF; padding: 12px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; display: inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #666666; font-size: 12px; line-height: 1.4;">
        If the button doesn't work, copy and paste this URL into your browser:<br/>
        <a href="{verification_link}" style="color: #2F5233;">{verification_link}</a>
      </p>
    </div>
    """

    # 1. Try Brevo API first
    ok, _ = _send_via_brevo_api(email, subject, html_content)
    if ok:
        return

    # 2. Try SMTP
    ok, _ = _send_via_smtp(email, subject, html_content, text_content)
    if ok:
        return

    # 3. Try Resend
    ok, _ = _send_via_resend(email, subject, html_content)
    if ok:
        return

    logger.info(f"[LOCAL DEV STUB] Verification Link for {email}: {verification_link}")
    print(f"[LOCAL DEV STUB] Verification Link for {email}: {verification_link}")


def send_password_reset_email(email: str, token: str) -> None:
    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    subject = "Reset your CampusCircle Password"
    text_content = f"CampusCircle Password Reset: Use this link to reset your password: {reset_link}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #DADDD8; border-radius: 16px; background-color: #F5F6F4;">
      <h2 style="color: #2F5233; margin-top: 0;">Password Reset Request</h2>
      <p style="color: #14171A; font-size: 15px; line-height: 1.5;">
        We received a request to reset your password for your CampusCircle account. Click the button below to choose a new password:
      </p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="{reset_link}" style="background-color: #2F5233; color: #FFFFFF; padding: 12px 24px; border-radius: 12px; font-weight: bold; text-decoration: none; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #666666; font-size: 12px; line-height: 1.4;">
        If you did not request a password reset, you can safely ignore this email. This link will expire in 1 hour.<br/><br/>
        Direct link:<br/>
        <a href="{reset_link}" style="color: #2F5233;">{reset_link}</a>
      </p>
    </div>
    """

    # 1. Try Brevo API first
    ok, _ = _send_via_brevo_api(email, subject, html_content)
    if ok:
        return

    # 2. Try SMTP
    ok, _ = _send_via_smtp(email, subject, html_content, text_content)
    if ok:
        return

    # 3. Try Resend
    ok, _ = _send_via_resend(email, subject, html_content)
    if ok:
        return

    logger.info(f"[LOCAL DEV STUB] Reset Link for {email}: {reset_link}")
    print(f"[LOCAL DEV STUB] Reset Link for {email}: {reset_link}")
