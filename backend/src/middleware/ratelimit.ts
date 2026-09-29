import { rateLimit } from 'express-rate-limit';

//rate limit middleware to limit the number of requests from a single IP address
//this is to prevent abuse and protect the server from being overwhelmed by too many requests
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300, // limit each IP to 300 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      message:
        'Too many requests from this IP, please try again after 15 minutes',
    },
  },
});

//tighter limiter for auth-adjustment routes to prevent brute force attacks
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // limit each IP to 50 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later',
    },
  },
});
