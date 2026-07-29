import uuid
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from src.database import get_db
from src.models.user import User
from src.models.university import University
from src.schemas.auth import (
    UserSignupRequest, 
    UserSignupResponse, 
    EmailVerificationRequest, 
    EmailVerificationResponse,
    UserLoginRequest,
    TokenResponse,
    TokenRefreshRequest,
    TokenRefreshResponse,
    LogoutRequest,
    LogoutResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    ResetPasswordResponse
)
from src.auth.security import (
    hash_password, 
    generate_verification_token, 
    verify_verification_token,
    generate_password_reset_token,
    verify_password_reset_token,
    verify_password,
    create_access_token,
    AuthError
)
from src.repositories.auth_repository import (
    create_refresh_token,
    validate_refresh_token,
    revoke_refresh_token,
    revoke_all_for_user
)
from src.workers.email import send_verification_email, send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])


class InMemoryRateLimiter:
    def __init__(self, limit: int = 5, window_seconds: int = 3600):
        self.limit = limit
        self.window_seconds = window_seconds
        self.history = defaultdict(list)

    def is_rate_limited(self, key: str) -> bool:
        now = time.time()
        self.history[key] = [
            ts for ts in self.history[key]
            if now - ts < self.window_seconds
        ]
        return len(self.history[key]) >= self.limit

    def record(self, key: str):
        self.history[key].append(time.time())


def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


# Rate Limiters:
# 1. Signup: max 5 attempts per hour per IP
signup_ip_limiter = InMemoryRateLimiter(limit=5, window_seconds=3600)

# 2. Login:
# - max 20 total login attempts per IP per hour
login_ip_limiter = InMemoryRateLimiter(limit=20, window_seconds=3600)
# - max 10 failed login attempts per email per hour
login_email_limiter = InMemoryRateLimiter(limit=10, window_seconds=3600)


from src.workers.email import send_verification_email


@router.post(
    "/signup", 
    response_model=UserSignupResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user"
)
async def signup(
    payload: UserSignupRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = get_client_ip(request)
    if signup_ip_limiter.is_rate_limited(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Too many signup attempts from this IP address."
        )
    signup_ip_limiter.record(client_ip)

    # 1. Extract email domain and look up matching University
    email_domain = payload.email.split("@")[1].strip().lower()
    
    university_stmt = select(University).where(University.email_domain == email_domain)
    university_result = await db.execute(university_stmt)
    university = university_result.scalar_one_or_none()
    
    if not university:
        # Dynamic support for academic domains (.ac.in, .edu, .edu.in, .ac.uk, etc.)
        if any(email_domain.endswith(suffix) for suffix in [".edu", ".ac.in", ".edu.in", ".ac.uk", ".edu.au", ".in"]):
            uni_name = email_domain.split(".")[0].upper() + " University"
            university = University(
                id=uuid.uuid4(),
                name=uni_name,
                email_domain=email_domain
            )
            db.add(university)
            await db.flush()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The email domain is not associated with any supported university."
            )
        
    # 2. Check if email already exists
    email_check_stmt = select(User).where(User.email == payload.email)
    email_check_result = await db.execute(email_check_stmt)
    if email_check_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists."
        )
        
    # 3. Check if username already exists
    username_check_stmt = select(User).where(User.username == payload.username)
    username_check_result = await db.execute(username_check_stmt)
    if username_check_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The username is already taken."
        )
        
    # 4. Hash the password and create the User
    hashed_password = hash_password(payload.password)
    
    new_user = User(
        id=uuid.uuid4(),
        university_id=university.id,
        email=payload.email,
        username=payload.username,
        password_hash=hashed_password,
        email_verified=True
    )
    
    db.add(new_user)
    await db.flush()  # Populates new_user.id
    
    # 5. Generate email verification token
    verification_token = generate_verification_token(new_user.id)
    
    # 6. Add email sending to background tasks (Resend API or local dev stub)
    background_tasks.add_task(send_verification_email, new_user.email, verification_token)
    
    # Commit transaction to DB
    await db.commit()
    
    return UserSignupResponse(
        user_id=str(new_user.id),
        message="Verification email sent"
    )


@router.post(
    "/verify-email",
    response_model=EmailVerificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Verify email using verification token"
)
async def verify_email(
    payload: EmailVerificationRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        user_id = verify_verification_token(payload.token)
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
        
    import uuid
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format in token."
        )
        
    stmt = select(User).where(User.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
        
    if user.email_verified:
        return EmailVerificationResponse(message="Email is already verified.")
        
    user.email_verified = True
    await db.commit()
    
    return EmailVerificationResponse(message="Email verified successfully.")


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Login and obtain access and refresh tokens"
)
async def login(
    payload: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = get_client_ip(request)
    email = payload.email.strip().lower()

    # 1. Check IP rate limit (max 20 total login attempts per IP per hour)
    if login_ip_limiter.is_rate_limited(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Too many login attempts from this IP address."
        )

    # 2. Check email rate limit (max 10 failed attempts per email per hour)
    if login_email_limiter.is_rate_limited(email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Too many failed login attempts for this email address."
        )

    login_ip_limiter.record(client_ip)

    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(payload.password, user.password_hash):
        login_email_limiter.record(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
        
    if not user.email_verified:
        login_email_limiter.record(email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address first."
        )
        
    if user.is_banned:
        login_email_limiter.record(email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been banned."
        )
        
    access_token = create_access_token(
        user_id=user.id,
        university_id=user.university_id,
        role=user.role,
        username=user.username
    )
    
    refresh_token = await create_refresh_token(db, user.id)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token
    )


@router.post(
    "/refresh",
    response_model=TokenRefreshResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token using refresh token"
)
async def refresh(
    payload: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    user_id = await validate_refresh_token(db, payload.refresh_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token."
        )
        
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token not found."
        )
        
    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been banned."
        )
        
    access_token = create_access_token(
        user_id=user.id,
        university_id=user.university_id,
        role=user.role,
        username=user.username
    )
    
    return TokenRefreshResponse(access_token=access_token)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout user and revoke refresh token"
)
async def logout(
    payload: LogoutRequest,
    db: AsyncSession = Depends(get_db)
):
    await revoke_refresh_token(db, payload.refresh_token)
    return LogoutResponse(message="Successfully logged out.")


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Request a password reset link"
)
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    email = payload.email.strip().lower()
    stmt = select(User).where(func.lower(User.email) == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        reset_token = generate_password_reset_token(user.id)
        background_tasks.add_task(send_password_reset_email, user.email, reset_token)

    # ALWAYS return the exact same generic message regardless of email existence (prevents account enumeration)
    return ForgotPasswordResponse(
        message="If an account with that email exists, password reset instructions have been sent."
    )


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset password using reset token"
)
async def reset_password(
    payload: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    try:
        user_id_str = verify_password_reset_token(payload.token)
    except AuthError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID in reset token."
        )

    stmt = select(User).where(User.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    # Update password hash
    user.password_hash = hash_password(payload.new_password)

    # Revoke ALL active refresh tokens for this user (force re-login everywhere for security)
    await revoke_all_for_user(db, user.id)

    await db.commit()

    return ResetPasswordResponse(
        message="Password reset successfully. Please log in with your new password."
    )
