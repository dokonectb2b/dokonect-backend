import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class CloudinaryService {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(private config: ConfigService) {
    this.bucket = this.config.get<string>('R2_BUCKET_NAME');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL').replace(/\/$/, '');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: this.config.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadImage(file: Express.Multer.File, folder: string = 'dokonect'): Promise<string> {
    const ext = path.extname(file.originalname) || '.jpg';
    const key = `${folder}/${randomUUID()}${ext}`;

    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      },
    });

    await upload.done();
    return `${this.publicUrl}/${key}`;
  }

  async uploadMultipleImages(files: Express.Multer.File[], folder: string = 'dokonect'): Promise<string[]> {
    return Promise.all(files.map((file) => this.uploadImage(file, folder)));
  }

  async deleteImage(publicId: string): Promise<void> {
    // publicId sifatida to'liq URL yoki faqat key qabul qiladi
    const key = publicId.startsWith('http')
      ? publicId.replace(`${this.publicUrl}/`, '')
      : publicId;

    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
