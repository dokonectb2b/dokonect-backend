import { Injectable } from '@nestjs/common';
import { StorageService } from '../cloudinary/cloudinary.service';

@Injectable()
export class UploadService {
  constructor(private cloudinary: StorageService) {}

  async uploadSingle(file: Express.Multer.File, folder: string = 'dokonect') {
    const url = await this.cloudinary.uploadImage(file, folder);
    return { url };
  }

  async uploadMultiple(files: Express.Multer.File[], folder: string = 'dokonect') {
    const urls = await this.cloudinary.uploadMultipleImages(files, folder);
    return { urls };
  }

  async deleteImage(publicId: string) {
    await this.cloudinary.deleteImage(publicId);
    return { success: true };
  }
}
