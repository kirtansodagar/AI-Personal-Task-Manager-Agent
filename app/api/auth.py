import hashlib
import secrets

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """
    Secure password hashing using Python's built-in PBKDF2 with SHA-256.
    Returns (hashed_password, salt).
    """
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return hashed, salt

def verify_password(password: str, hashed_password: str, salt: str) -> bool:
    """
    Verify password against hashed value and salt using timing-safe comparison.
    """
    hashed, _ = hash_password(password, salt)
    return secrets.compare_digest(hashed, hashed_password)

def generate_session_token() -> str:
    """
    Generate a cryptographically secure random session token.
    """
    return secrets.token_hex(32)
