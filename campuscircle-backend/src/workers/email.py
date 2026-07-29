"""
Email delivery worker module supporting Resend API and local dev stub fallback.
"""
import logging
from src.config import settings

logger = logging.getLogger(__name__)


def send_verification_email(email: str, token: str) -> None:
    """
    Delivers a verification email containing the verification token link.
    - If RESEND_API_KEY is configured in settings, sends real email via Resend API.
    - If RESEND_API_KEY is not set (Local Dev), falls back to log stub.
    - Gracefully catches and logs errors without failing the background task.
    """
    verification_link = f"{settings.frontend_url.rstrip('/')}/verify-pending?token={token}"

    if settings.resend_api_key and settings.resend_api_key.strip():
        try:
            import resend
            resend.api_key = settings.resend_api_key.strip()

            params: resend.Emails.SendParams = {
                "from": settings.from_email_address,
                "to": [email],
                "subject": "Verify your CampusCircle Account",
                "html": f"""
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
                """,
            }

            response = resend.Emails.send(params)
            email_id = getattr(response, "id", None) or (response.get("id") if isinstance(response, dict) else "sent")
            logger.info(f"Verification email sent to {email} via Resend. ID: {email_id}")
        except Exception as e:
            logger.error(f"Failed to send verification email to {email} via Resend: {str(e)}", exc_info=True)
    else:
        # Fallback for Local Development without API Key
        logger.info(f"[LOCAL DEV STUB] Sending email verification to {email}")
        logger.info(f"[LOCAL DEV STUB] Verification Link: {verification_link}")
        print(f"[LOCAL DEV STUB] Verification Link for {email}: {verification_link}")


def send_password_reset_email(email: str, token: str) -> None:
    """
    Delivers a password reset email containing the password reset token link.
    - If RESEND_API_KEY is configured in settings, sends real email via Resend API.
    - If RESEND_API_KEY is not set (Local Dev), falls back to log stub.
    - Gracefully catches and logs errors without failing the request.
    """
    reset_link = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"

    if settings.resend_api_key and settings.resend_api_key.strip():
        try:
            import resend
            resend.api_key = settings.resend_api_key.strip()

            params: resend.Emails.SendParams = {
                "from": settings.from_email_address,
                "to": [email],
                "subject": "Reset your CampusCircle Password",
                "html": f"""
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
                """,
            }

            response = resend.Emails.send(params)
            email_id = getattr(response, "id", None) or (response.get("id") if isinstance(response, dict) else "sent")
            logger.info(f"Password reset email sent to {email} via Resend. ID: {email_id}")
        except Exception as e:
            logger.error(f"Failed to send password reset email to {email} via Resend: {str(e)}", exc_info=True)
    else:
        # Fallback for Local Development without API Key
        logger.info(f"[LOCAL DEV STUB] Sending password reset to {email}")
        logger.info(f"[LOCAL DEV STUB] Reset Link: {reset_link}")
        print(f"[LOCAL DEV STUB] Password Reset Link for {email}: {reset_link}")
