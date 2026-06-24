import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  accountId: number;
  email: string;
  username: string;
  role: string;
}

/** Injects the authenticated user (populated by JwtStrategy) into a handler. */
export const CurrentUser = createParamDecorator((data: keyof AuthUser | undefined, ctx: ExecutionContext): any => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as AuthUser;
  return data ? user?.[data] : user;
});
