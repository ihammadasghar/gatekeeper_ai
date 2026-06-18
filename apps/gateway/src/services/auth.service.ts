import type { IUserRepository } from '@gatekeeper/types';

export interface GitHubOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly frontendUrl: string;
}

interface GitHubTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
}

interface GitHubUserProfile {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string;
}

export interface IAuthService {
  getOAuthUrl(): string;
  handleCallback(code: string): Promise<{ readonly userId: string }>;
}

export class GitHubAuthService implements IAuthService {
  private static readonly AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
  private static readonly TOKEN_URL = 'https://github.com/login/oauth/access_token';
  private static readonly USER_URL = 'https://api.github.com/user';
  private static readonly SCOPE = 'read:user,repo';

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly config: GitHubOAuthConfig,
  ) {}

  getOAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: GitHubAuthService.SCOPE,
    });
    return `${GitHubAuthService.AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<{ readonly userId: string }> {
    const accessToken = await this.exchangeCodeForToken(code);
    const profile = await this.fetchUserProfile(accessToken);

    const user = await this.userRepo.upsert({
      githubId: String(profile.id),
      login: profile.login,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      accessToken,
    });

    return { userId: user.id };
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const response = await fetch(GitHubAuthService.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      throw Object.assign(new Error('Failed to exchange OAuth code'), { status: 502 });
    }

    const data = (await response.json()) as GitHubTokenResponse;

    if (!data.access_token) {
      throw Object.assign(new Error('No access token in OAuth response'), { status: 502 });
    }

    return data.access_token;
  }

  private async fetchUserProfile(accessToken: string): Promise<GitHubUserProfile> {
    const response = await fetch(GitHubAuthService.USER_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw Object.assign(new Error('Failed to fetch GitHub user profile'), { status: 502 });
    }

    return (await response.json()) as GitHubUserProfile;
  }
}
