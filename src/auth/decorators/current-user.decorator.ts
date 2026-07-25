import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const getCurrentUserByContext = (context: ExecutionContext) => {
  if (context.getType() === 'http') {
    return context.switchToHttp().getRequest().user;
  }

  if (context.getType() === 'ws') {
    return context.switchToWs().getData().user;
  }
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    getCurrentUserByContext(context),
);
