import crypto from 'node:crypto';
import { AuditActorType } from '@youpi/common';

export class AuditLogRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * The SQLite schema keeps the unprefixed name; the Postgres schema prefixes it to
   * avoid colliding with the movie booking `audit_logs` table.
   */
  get table() {
    return this.db.dialect === 'postgres' ? 'youpi_audit_logs' : 'audit_logs';
  }

  log(data) {
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const details = typeof data.details === 'object' ? JSON.stringify(data.details) : (data.details || '{}');

    const sql = `
      INSERT INTO ${this.table} (id, merchant_id, entity_type, entity_id, action, actor_type, actor_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    this.db.execute(sql, [
      id,
      data.merchantId || null,
      data.entityType,
      data.entityId,
      data.action,
      data.actorType || AuditActorType.SYSTEM,
      data.actorId || null,
      details,
      data.ipAddress || null,
      now
    ]);

    return id;
  }

  findByEntity(entityType, entityId) {
    const rows = this.db.query(
      `SELECT * FROM ${this.table} WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC`,
      [entityType, entityId]
    );
    return rows.map(r => this.mapRow(r));
  }

  findByMerchant(merchantId, limit = 100) {
    const rows = this.db.query(
      `SELECT * FROM ${this.table} WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
      [merchantId, limit]
    );
    return rows.map(r => this.mapRow(r));
  }

  mapRow(row) {
    return {
      id: row.id,
      merchantId: row.merchant_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      action: row.action,
      actorType: row.actor_type,
      actorId: row.actor_id,
      details: JSON.parse(row.details || '{}'),
      ipAddress: row.ip_address,
      createdAt: new Date(row.created_at)
    };
  }
}
