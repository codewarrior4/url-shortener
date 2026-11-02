import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database/database.options.js';
import { environmentSchema } from './config/environment.schema.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: environmentSchema,
      validationOptions: {
        libraryOptions: { abortEarly: false, allowUnknown: true },
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        databaseOptions(config.getOrThrow<string>('DATABASE_URL')),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
