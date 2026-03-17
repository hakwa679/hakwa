import type { Request, Response, NextFunction } from "express";

function redactShareToken(path: string): string {
  return path.replace(/(\/safety\/share\/)[^/]+/g, "$1[REDACTED]");
}

export function requestLogger(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const safePath = redactShareToken(req.path);
  console.info("[request]", {
    method: req.method,
    path: safePath,
  });
  next();
}
