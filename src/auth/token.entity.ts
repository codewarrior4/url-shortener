import { User } from './user.entity.js';
import { AuthSession } from './session.entity.js';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
@Entity('auth_tokens')
export class AuthToken {
  @PrimaryGeneratedColumn('identity') id: number;
  @Index('auth_tokens_userId_idx') @Column({ type: 'int' }) userId: number;
  @Column({ type: 'int', nullable: true }) sessionId: number | null;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'auth_tokens_userId_fkey',
  })
  user: User;
  @ManyToOne(() => AuthSession, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({
    name: 'sessionId',
    foreignKeyConstraintName: 'auth_tokens_sessionId_fkey',
  })
  session: AuthSession | null;
  @Column({ type: 'varchar', length: 16 }) purpose:
    'verify' | 'reset' | 'refresh';
  @Column({ type: 'varchar', length: 64, unique: true, select: false })
  hash: string;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) consumedAt: Date | null;
}
