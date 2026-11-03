import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLinkLifecycle1793696826224 implements MigrationInterface {
    name = 'AddLinkLifecycle1793696826224'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" ADD "expiresAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "links" ADD "isEnabled" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "links" DROP COLUMN "isEnabled"`);
        await queryRunner.query(`ALTER TABLE "links" DROP COLUMN "expiresAt"`);
    }

}
