import { User } from './user.entity.js';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('identity') id: number;
  @Index('auth_sessions_userId_idx') @Column({ type: 'int' }) userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'auth_sessions_userId_fkey',
  })
  user: User;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
}
