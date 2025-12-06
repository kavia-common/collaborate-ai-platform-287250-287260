const jwt = require('jsonwebtoken');

/**
 * Extract and verify the JWT token.
 * @param {string} token - The raw token string (possibly with 'Bearer ' prefix).
 * @returns {Object|null} - The decoded user object if valid, otherwise null.
 */
const getUserFromToken = (token) => {
  if (!token) return null;

  try {
    // Remove 'Bearer ' prefix if present (case insensitive)
    if (token.match(/^Bearer /i)) {
      const parts = token.split(' ');
      token = parts[parts.length - 1];
    }

    if (!token) return null;

    const secret = process.env.JWT_SECRET || 'fallback_secret';

    const decoded = jwt.verify(token, secret);

    // Normalize and return user info
    // Expecting payload to contain { id (or _id), companyId, role, email }
    return {
      id: decoded.id || decoded._id,
      companyId: decoded.companyId,
      role: decoded.role,
      email: decoded.email
    };
  } catch (err) {
    // Token is invalid or expired
    return null;
  }
};

module.exports = {
  getUserFromToken
};
