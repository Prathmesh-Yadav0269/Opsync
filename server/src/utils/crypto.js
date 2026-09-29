import crypto from 'crypto';

export const createResetToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  return { resetToken, hashedToken };
};

export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
