"""
Email delivery worker module supporting SMTP (Gmail App Password, Brevo, SendGrid), Resend API, and local dev stub fallback.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from src.config import settings

logger = logging.getLogger(__name__)


def diagnose_email_sending(to_email: str) -> dict:
    """
    Executes a test email send synchronously and returns detailed diagnostic results.
    """
    results = {
        "smtp_configured": bool(settings.smtp_username and settings.smtp_password),
        "resend_configured": bool(settings.resend_api_key),
        "smtp_server": settings.smtp_server,
        "smtp_port": settings.smtp_port,
        "smtp_username": settings.smtp_username if settings.smtp_username else "NOT_SET",
        "methods_tried": [],
        "status": "pending",
        "details": ""
    }

    subject = "CampusCircle Email Delivery Test"
    text_content = "This is a test email from CampusCircle to verify email delivery configurations."
    html_content = "<h2>CampusCircle Email Test</h2><p>This is a test email confirming email delivery is active!</p>"

    # 1. Try SMTP if configured
    if settings.smtp_username and settings.smtp_password:
        results["methods_tried"].append("smtp")
        sender = settings.from_email_address.strip() or settings.smtp_username.strip()
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = sender
        msg["To"] = to_email
        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        try:
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_server, settings.smtp_port, timeout=10) as server:
                    server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
                    server.sendmail(sender, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=10) as server:
                    server.starttls()
                    server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
                    server.sendmail(sender, [to_email], msg.as_string())

            results["status"] = "success"
            results["details"] = f"Successfully delivered email to {to_email} via SMTP ({settings.smtp_server})"
            return results
        except Exception as e:
            results["smtp_error"] = str(e)
            logger.error(f"SMTP diagnostic failed: {str(e)}", exc_info=True)

    # 2. Try Resend API if configured
    if settings.resend_api_key and settings.resend_api_key.strip():
        results["methods_tried"].append("resend")
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
            res = resend.Emails.send(params)
            email_id = getattr(res, "id", None) or (res.get("id") if isinstance(res, dict) else "sent")
            results["status"] = "success"
            results["details"] = f"Successfully delivered email to {to_email} via Resend API (ID: {email_id})"
            return results
        except Exception as e:
            results["resend_error"] = str(e)
            logger.error(f"Resend diagnostic failed: {str(e)}", exc_info=True)

    # 3. Fallback to Local Dev Stub
    results["methods_tried"].append("stub")
    results["status"] = "stubbed"
    results["details"] = (
        "Neither SMTP nor Resend API credentials are valid/configured on Render. "
        "The system logged the email to server logs instead of sending a physical email. "
        "Please check your Render environment variables (SMTP_USERNAME, SMTP_PASSWORD)."
    )
    return results


def _send_via_smtp(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    if not settings.smtp_username or not settings.smtp_password:
        return False

    sender = settings.from_email_address.strip() or settings.smtp_username.strip()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_server, settings.smtp_port, timeout=10) as server:
                server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
                server.sendmail(sender, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_server, settings.smtp_port, timeout=10) as server:
                server.starttls()
                server.login(settings.smtp_username.strip(), settings.smtp_password.strip())
                server.sendmail(sender, [to_email], msg.as_string())

        logger.info(f"Email successfully sent to {to_email} via SMTP ({settings.smtp_server}).")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via SMTP: {str(e)}", exc_info=True)
        return False


def _send_via_resend(to_email: str, subject: str, html_content: str) -> bool:
    if not settings.resend_api_key or not settings.resend_api_key.strip():
        return False

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
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via Resend: {str(e)}", exc_info=True)
        return False


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

    if _send_via_smtp(email, subject, html_content, text_content):
        return

    if _send_via_resend(email, subject, html_content):
        return

    logger.info(f"[LOCAL DEV STUB] Sending email verification to {email}")
    logger.info(f"[LOCAL DEV STUB] Verification Link: {verification_link}")
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

    if _send_via_smtp(email, subject, html_content, text_content):
        return

    if _send_via_resend(email, subject, html_content):
        return

    logger.info(f"[LOCAL DEV STUB] Sending password reset to {email}")
    logger.info(f"[LOCAL DEV STUB] Reset Link: {reset_link}")
    print(f"[LOCAL DEV STUB] Password Reset Link for {email}: {reset_link}")
