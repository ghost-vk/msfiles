export interface AuthContext {
  headers: { [key: string]: string };
  user: {
    user_id: number;
  };
  rawHeaders?: string[];
  params?: Record<string, unknown>;
}

export type UserAuthPayload = AuthContext['user'];