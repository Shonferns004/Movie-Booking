import { getDatabase, ensureDatabaseInitialized } from '../vendor/youpi-pg/packages/db/src/database.js';
import { runMigrations } from '../vendor/youpi-pg/packages/db/src/migrate.js';

const db = getDatabase();
ensureDatabaseInitialized(db);

const m = runMigrations(db);
console.log('migrated ok, dialect:', db.dialect, 'schema:', db.schema, 'merchant:', m.defaultMerchant?.slug);

try { db.close(); } catch {}
