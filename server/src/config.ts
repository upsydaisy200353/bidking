import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

export const config = {
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT) || 3001,
  /** Neon / Supabase 等免费 PostgreSQL 连接串；未设置则回退到本地 JSON 文件 */
  databaseUrl: process.env.DATABASE_URL ?? '',
  dataDir: process.env.DATA_DIR ?? join(__dirname, '../../data'),
  clientDist: join(__dirname, '../../client/dist'),
  corsOrigin: process.env.CORS_ORIGIN ?? (isProduction ? false : '*'),
};
