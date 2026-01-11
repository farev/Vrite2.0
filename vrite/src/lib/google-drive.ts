/**
 * Google Drive API Client
 * Direct integration with Google Drive API for document storage
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

export interface DriveFileMetadata {
  name: string;
  mimeType: string;
  parents?: string[];
}

export class GoogleDriveClient {
  private accessToken: string;
  private baseUrl = 'https://www.googleapis.com/drive/v3';
  private uploadUrl = 'https://www.googleapis.com/upload/drive/v3';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * List all markdown documents in Drive
   * Returns files ordered by most recently modified
   */
  async listDocuments(): Promise<DriveFile[]> {
    console.log('[GoogleDrive] Listing documents');
    
    try {
      const query = encodeURIComponent(
        "mimeType='text/markdown' and trashed=false"
      );
      
      const response = await fetch(
        `${this.baseUrl}/files?q=${query}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleDrive] List failed:', response.status, errorText);
        throw new Error(`Failed to list documents: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[GoogleDrive] Found', data.files?.length || 0, 'documents');
      
      return data.files || [];
    } catch (error) {
      console.error('[GoogleDrive] List error:', error);
      throw error;
    }
  }

  /**
   * Get a specific document's content and metadata
   */
  async getDocument(fileId: string): Promise<{ content: string; metadata: DriveFile }> {
    console.log('[GoogleDrive] Fetching document:', fileId);
    
    try {
      // Fetch metadata
      const metadataResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime,size`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        console.error('[GoogleDrive] Metadata fetch failed:', metadataResponse.status, errorText);
        throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
      }

      const metadata = await metadataResponse.json();

      // Fetch content
      const contentResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?alt=media`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!contentResponse.ok) {
        const errorText = await contentResponse.text();
        console.error('[GoogleDrive] Content fetch failed:', contentResponse.status, errorText);
        throw new Error(`Failed to fetch content: ${contentResponse.status}`);
      }

      const content = await contentResponse.text();
      console.log('[GoogleDrive] Document fetched successfully, size:', content.length, 'bytes');

      return { content, metadata };
    } catch (error) {
      console.error('[GoogleDrive] Get document error:', error);
      throw error;
    }
  }

  /**
   * Save a document (create new or update existing)
   */
  async saveDocument(
    fileId: string | null,
    title: string,
    content: string
  ): Promise<DriveFile> {
    console.log('[GoogleDrive] Saving document:', title, 'ID:', fileId);
    
    if (fileId) {
      return await this.updateFile(fileId, content);
    } else {
      return await this.createFile(title, content);
    }
  }

  /**
   * Create a new file in Google Drive
   */
  async createFile(title: string, content: string): Promise<DriveFile> {
    console.log('[GoogleDrive] Creating new file:', title);
    
    try {
      const fileName = title.endsWith('.md') ? title : `${title}.md`;
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata: DriveFileMetadata = {
        name: fileName,
        mimeType: 'text/markdown',
      };

      const multipartBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/markdown\r\n\r\n' +
        content +
        closeDelimiter;

      const response = await fetch(
        `${this.uploadUrl}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleDrive] Create failed:', response.status, errorText);
        throw new Error(`Failed to create file: ${response.status} ${errorText}`);
      }

      const file = await response.json();
      console.log('[GoogleDrive] File created successfully:', file.id);
      
      return file;
    } catch (error) {
      console.error('[GoogleDrive] Create error:', error);
      throw error;
    }
  }

  /**
   * Update an existing file's content
   */
  async updateFile(fileId: string, content: string): Promise<DriveFile> {
    console.log('[GoogleDrive] Updating file:', fileId);
    
    try {
      // Update content
      const updateResponse = await fetch(
        `${this.uploadUrl}/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'text/markdown',
          },
          body: content,
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[GoogleDrive] Update failed:', updateResponse.status, errorText);
        throw new Error(`Failed to update file: ${updateResponse.status} ${errorText}`);
      }

      // Fetch updated metadata
      const metadataResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?fields=id,name,mimeType,modifiedTime`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!metadataResponse.ok) {
        console.warn('[GoogleDrive] Failed to fetch updated metadata');
        // Return basic info if metadata fetch fails
        return {
          id: fileId,
          name: 'Unknown',
          mimeType: 'text/markdown',
          modifiedTime: new Date().toISOString(),
        };
      }

      const file = await metadataResponse.json();
      console.log('[GoogleDrive] File updated successfully:', file.id);
      
      return file;
    } catch (error) {
      console.error('[GoogleDrive] Update error:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Google Drive
   */
  async deleteFile(fileId: string): Promise<void> {
    console.log('[GoogleDrive] Deleting file:', fileId);
    
    try {
      const response = await fetch(
        `${this.baseUrl}/files/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GoogleDrive] Delete failed:', response.status, errorText);
        throw new Error(`Failed to delete file: ${response.status} ${errorText}`);
      }

      console.log('[GoogleDrive] File deleted successfully');
    } catch (error) {
      console.error('[GoogleDrive] Delete error:', error);
      throw error;
    }
  }
}
