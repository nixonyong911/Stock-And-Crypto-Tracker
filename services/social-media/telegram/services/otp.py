"""OTP (One-Time Password) service for Telegram bot authentication."""

import random
import string
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import asyncpg

from config import DATABASE_URL, OTP_EXPIRY_MINUTES, OTP_LENGTH


class OTPService:
    """Manages OTP generation and verification."""
    
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None
    
    async def get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=5)
        return self._pool
    
    async def close(self):
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None
    
    def generate_otp(self) -> str:
        """Generate a random OTP code."""
        return ''.join(random.choices(string.digits, k=OTP_LENGTH))
    
    async def create_otp(
        self,
        phone_number: str,
        telegram_user_id: int,
        telegram_chat_id: int
    ) -> str:
        """Create a new OTP for a phone number. Returns the OTP code."""
        pool = await self.get_pool()
        otp_code = self.generate_otp()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
        
        async with pool.acquire() as conn:
            # Invalidate any existing unverified OTPs for this phone
            await conn.execute(
                """
                UPDATE telegram_otp 
                SET verified = true 
                WHERE phone_number = $1 AND verified = false
                """,
                phone_number
            )
            
            # Create new OTP
            await conn.execute(
                """
                INSERT INTO telegram_otp 
                (phone_number, otp_code, telegram_user_id, telegram_chat_id, expires_at)
                VALUES ($1, $2, $3, $4, $5)
                """,
                phone_number,
                otp_code,
                telegram_user_id,
                telegram_chat_id,
                expires_at
            )
        
        return otp_code
    
    async def verify_otp(
        self,
        phone_number: str,
        otp_code: str,
        telegram_user_id: int
    ) -> Optional[Dict[str, Any]]:
        """
        Verify an OTP code. Returns OTP record if valid, None if invalid.
        Marks the OTP as verified if successful.
        """
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            # Find valid OTP
            row = await conn.fetchrow(
                """
                SELECT * FROM telegram_otp 
                WHERE phone_number = $1 
                  AND otp_code = $2
                  AND telegram_user_id = $3
                  AND verified = false
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                """,
                phone_number,
                otp_code,
                telegram_user_id
            )
            
            if row:
                # Mark as verified
                await conn.execute(
                    "UPDATE telegram_otp SET verified = true WHERE id = $1",
                    row["id"]
                )
                return dict(row)
            
            return None
    
    async def get_pending_otp(
        self,
        telegram_user_id: int,
        telegram_chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get pending (unverified) OTP for a Telegram user."""
        pool = await self.get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM telegram_otp 
                WHERE telegram_user_id = $1 
                  AND telegram_chat_id = $2
                  AND verified = false
                  AND expires_at > NOW()
                ORDER BY created_at DESC
                LIMIT 1
                """,
                telegram_user_id,
                telegram_chat_id
            )
            return dict(row) if row else None
    
    async def cleanup_expired(self):
        """Clean up expired OTP records."""
        pool = await self.get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM telegram_otp WHERE expires_at < NOW()"
            )

