import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from './user-role.js';
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('identity') id: number;
  @Column({ type: 'varchar', length: 254, unique: true }) email: string;
  @Column({ type: 'enum', enum: UserRole, default: UserRole.User })
  role: UserRole;
  @Column({ type: 'text', select: false }) passwordHash: string;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
