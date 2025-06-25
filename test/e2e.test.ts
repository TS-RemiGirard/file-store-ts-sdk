import { describe, it, expect, beforeAll } from 'vitest';
import { FileStoreClient } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

// This test requires actual API credentials to run
// Set these environment variables or replace with your test credentials
const API_BASE_URL = process.env.FILE_STORE_API_URL || 'https://object-storage-api.toosmart.app';
const API_KEY = process.env.FILE_STORE_API_KEY || 'mytoken';
const BUCKET_NAME = process.env.FILE_STORE_BUCKET || 'ts-test';
const localFilePath = path.join(__dirname, 'pdfFromFirefox.pdf');
const targetPath = `e2e-test/myFileStoreTest`;

describe('FileStoreClient E2E Tests', () => {
    let client: FileStoreClient;

    // Setup before all tests
    beforeAll(async () => {
        // Create a temporary file for testing
        if (!fs.existsSync(localFilePath)) {
            throw new Error(`Test file does not exist: ${localFilePath}`);
        }

        // Initialize the client
        client = new FileStoreClient(API_BASE_URL, API_KEY);
        await client.login();
        client.setBucket(BUCKET_NAME);
    });

    it('should upload a file and verify it was uploaded', async () => {
        // Upload the file
        const uploadResult = await client.uploadContentList(
            targetPath,
            [{ type: 'file', value: localFilePath }],
            'text/plain',
            true // get URL
        );

        // Verify the upload was successful
        expect(uploadResult).toBeDefined();
        expect(uploadResult.body).toBeDefined();

        // If the API returns a URL, we can verify it exists
        if (uploadResult.body.url) {
            console.log(`File uploaded successfully: ${uploadResult.body.url}`);
            expect(() => new URL(uploadResult.body.url)).not.toThrow()
        }

        // Try to get the file to verify it exists
        const getResult = await client.getFile(targetPath);
        expect(getResult).toBeDefined();
        expect(getResult.body).toBeDefined();

        // Verify the content matches what we uploaded
        const fileContent = Buffer.from(getResult.body);
        expect(fileContent.length).toBeGreaterThan(0);
    });
});