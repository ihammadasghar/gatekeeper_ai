import type { IUserRepository } from '@gatekeeper/types';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const COOKIE_NAME = 'gatekeeper_session';

export function createAuthMiddleware(userRepo: IUserRepository): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.cookies[COOKIE_NAME] as string | undefined;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', status: 401 });
      return;
    }

    const user = await userRepo.findById(userId).catch(() => null);

    if (!user) {
      res.status(401).json({ error: 'Unauthorized', status: 401 });
      return;
    }

    req.user = user;
    next();
  };
}
