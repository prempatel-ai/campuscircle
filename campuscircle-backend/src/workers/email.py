"""
Email delivery worker module supporting SMTP (Gmail App Password, Brevo, SendGrid), Resend API, and local dev stub fallback.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from src.config import settings

logger = logging.getLogger(__name__)


def _send_via_smtp(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """
    Sends email via standard SMTP (e.g. Gmail SMTP with App Password, Brevo, etc.).
    Returns True if sent successfully, False otherwise.
    """
    if not settings.smtp_username or not settings.smtp_password:
        return False

    sender = settings.from_email_address.strip() or settings.smtp_username.strip()

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email

    part1 = MIMEText(text_content, "plain")
    part2 = MIMEText(html_content, "html")

    msg.attach(part1)
    msg.attach(part2)

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
    """
    Sends email via Resend API if API key is provided.
    """
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
    """
    Delivers a verification email containing the verification token link.
    Tries SMTP first, then Resend API, then falls back to local dev stub.
    """
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

    # Try SMTP first
    if _send_via_smtp(email, subject, html_content, text_content):
        return

    # Try Resend API second
    if _send_via_resend(email, subject, html_content):
        return

    # Fallback to local dev log stub
    logger.info(f"[LOCAL DEV STUB] Sending email verification to {email}")
    logger.info(f"[LOCAL DEV STUB] Verification Link: {verification_link}")
    print(f"[LOCAL DEV STUB] Verification Link for {email}: {verification_link}")


def send_password_reset_email(email: str, token: str) -> None:
    """
    Delivers a password reset email containing the password reset token link.
    Tries SMTP first, then Resend API, then falls back to local dev stub.
    """
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

    # Try SMTP first
    if _send_via_smtp(email, subject, html_content, text_content):
        return

    # Try Resend API second
    if _send_via_resend(email, subject, html_content):
        return

    # Fallback to local dev log stub
    logger.info(f"[LOCAL DEV STUB] Sending password reset to {email}")
    logger.info(f"[LOCAL DEV STUB] Reset Link: {reset_link}")
    print(f"[LOCAL DEV STUB] Password Reset Link for {email}: {reset_link}")
