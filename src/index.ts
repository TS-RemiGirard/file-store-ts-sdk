import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';
import * as fs from 'fs';
import FormData from 'form-data';

type ContentItem = { type: 'file' | 'path' | 'html', value: string };

export class FileStoreClient {
    private baseUrl: string;
    private apiKey: string;
    private client: AxiosInstance;
    private cookieJar: CookieJar;
    private jwt: string | null = null;
    private bucket: string | null = null;

    constructor(baseUrl: string, apiKey: string) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.apiKey = apiKey;
        this.cookieJar = new CookieJar();
        this.client = wrapper(axios.create({
            baseURL: this.baseUrl,
            jar: this.cookieJar,
            withCredentials: true,
            timeout: 60000,
            validateStatus: () => true,
        }));
    }

    public setBucket(bucket: string): void {
        this.bucket = bucket;
    }

    public async login(): Promise<string> {
        // Get CSRF token
        const csrfResp = await this.client.get('/api/auth/csrf');
        if (!csrfResp.data?.csrfToken) {
            throw new Error('CSRF token not found in response.');
        }
        const csrfToken = csrfResp.data.csrfToken;

        // Login with token and CSRF
        const loginResp = await this.client.post('/api/auth/callback/credentials', new URLSearchParams({
            csrfToken,
            token: this.apiKey,
        }), {
            headers: { 'Accept': 'application/json' }
        });

        // Extract JWT from cookie
        const cookies = await this.cookieJar.getCookies(this.baseUrl);
        const jwtCookie = cookies.find(c => c.key === 'jwt_token');
        if (!jwtCookie) {
            throw new Error('JWT cookie not found after login.');
        }
        this.jwt = jwtCookie.value;
        return this.jwt;
    }

    private getJwt(): string | null {
        return this.jwt;
    }

    private ensureAuthenticated(): void {
        if (!this.jwt) throw new Error('Not authenticated. Please login first.');
        if (!this.bucket) throw new Error('No bucket set. Please select bucket first.');
    }

    public async getFile(filePath: string): Promise<AxiosResponse> {
        this.ensureAuthenticated();
        const url = `/api/v2/file/${this.bucket}/${filePath}`;
        return this.requestWithAutoRelogin('get', url, {
            headers: { 'Accept': '*/*' },
            responseType: 'arraybuffer'
        }, true, false);
    }

    public async uploadContentList(
        targetPath: string,
        contentList: ContentItem[],
        mimeType?: string,
        getUrl: boolean = false,
        decodeJson: boolean = true
    ): Promise<any> {
        this.ensureAuthenticated();
        const url = `/api/v2/file/${this.bucket}/${targetPath}`;

        const form = new FormData();

        for (const item of contentList) {
            switch (item.type) {
                case 'file':
                    form.append('content_file', fs.createReadStream(item.value), {
                        filename: item.value.split('/').pop()
                    });
                    break;
                case 'path':
                    form.append('content_path', item.value);
                    break;
                case 'html':
                    form.append('content_html', item.value);
                    break;
            }
        }

        if (mimeType) {
            form.append('type', mimeType);
        }
        if (getUrl) {
            form.append('get_url', 'true');
        }

        const headers = {
            ...form.getHeaders(),
            'Accept': 'application/json',
        };

        return this.requestWithAutoRelogin('put', url, { headers, data: form }, true, decodeJson);
    }

    private async requestWithAutoRelogin(
        method: 'get' | 'post' | 'put' | 'delete',
        url: string,
        options: AxiosRequestConfig = {},
        retry: boolean = true,
        decodeJson: boolean = true
    ): Promise<any> {
        let response: AxiosResponse;
        try {
            response = await this.client.request({ method, url, ...options });
        } catch (e: any) {
            throw new Error('Request failed: ' + e.message);
        }

        if (response.status === 401 && retry) {
            await this.login();
            return this.requestWithAutoRelogin(method, url, options, false, decodeJson);
        }

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Request failed with status ${response.status}: ${response.data?.toString()}`);
        }

        if (decodeJson) {
            try {
                return {
                    body: typeof response.data === 'string' ? JSON.parse(response.data) : response.data,
                    headers: response.headers
                };
            } catch {
                return { body: response.data, headers: response.headers };
            }
        } else {
            return { body: response.data, headers: response.headers };
        }
    }
}

export default FileStoreClient;