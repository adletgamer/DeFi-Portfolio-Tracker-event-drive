import {
  CORS_HEADERS,
  getHttpMethod,
  getRawPath,
  isValidEthereumAddress,
  jsonResponse,
  optionsResponse,
  resolveRoute,
} from './http';

describe('ReadApi CORS helpers', () => {
  it('allows any origin, GET/OPTIONS methods, and Content-Type', () => {
    expect(CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    expect(CORS_HEADERS['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
    expect(CORS_HEADERS['Access-Control-Allow-Headers']).toBe('Content-Type');
    expect(CORS_HEADERS['Content-Type']).toBe('application/json');
  });

  it('responds to OPTIONS preflight with 200 and CORS headers', () => {
    const result = optionsResponse();
    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject(CORS_HEADERS);
    expect(result.body).toBe('');
  });

  it('attaches CORS headers to JSON responses', () => {
    const result = jsonResponse(400, { error: 'missing' });
    expect(result.statusCode).toBe(400);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(result.body)).toEqual({ error: 'missing' });
  });
});

describe('ReadApi routing', () => {
  it('reads HTTP method from Function URL events', () => {
    expect(getHttpMethod({ requestContext: { http: { method: 'options' } } })).toBe('OPTIONS');
    expect(getHttpMethod({ httpMethod: 'GET' })).toBe('GET');
    expect(getHttpMethod({})).toBe('GET');
  });

  it('reads the path from Function URL / API Gateway shapes', () => {
    expect(getRawPath({ rawPath: '/positions' })).toBe('/positions');
    expect(getRawPath({ requestContext: { http: { path: '/watchlist' } } })).toBe('/watchlist');
    expect(getRawPath({})).toBe('/');
  });

  it('maps / and /positions to the positions route', () => {
    expect(resolveRoute({ rawPath: '/' })).toBe('positions');
    expect(resolveRoute({ rawPath: '/positions' })).toBe('positions');
    expect(resolveRoute({ rawPath: '/positions/' })).toBe('positions');
  });

  it('maps /watchlist to the watchlist route', () => {
    expect(resolveRoute({ rawPath: '/watchlist' })).toBe('watchlist');
  });

  it('returns not_found for unknown paths', () => {
    expect(resolveRoute({ rawPath: '/health' })).toBe('not_found');
  });
});

describe('Ethereum address validation', () => {
  it('accepts 42-character 0x addresses', () => {
    expect(isValidEthereumAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEthereumAddress('0x1234')).toBe(false);
    expect(isValidEthereumAddress('1234567890abcdef1234567890abcdef12345678')).toBe(false);
    expect(isValidEthereumAddress('')).toBe(false);
  });
});
