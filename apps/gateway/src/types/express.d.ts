import type { User } from '@gatekeeper/types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
