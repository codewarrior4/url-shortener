import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('identity') id: number;
  @Column({ type: 'varchar', length: 254, unique: true }) email: string;
  @Column({ type: 'text', select: false }) passwordHash: string;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
