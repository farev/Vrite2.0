/**
 * OneDrive API Client
 * Direct integration with Microsoft Graph API for document storage
 */

export interface OneDriveFile {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime: string;
  file?: {
    mimeType: string;
  };
}

export interface OneDriveFileMetadata {
  name: string;
  file: {
    mimeType: string;
  };
}

export class OneDriveClient {
  private accessToken: string;
  private baseUrl = 'https://graph.microsoft.com/v1.0/me/drive';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * List all markdown documents in OneDrive
   * Returns files ordered by most recently modified
   */
  async listDocuments(): Promise<OneDriveFile[]> {
    console.log('[OneDrive] Listing documents');
    
    try {
      // List files in root folder, filter for .md files
      const response = await fetch(
        `${this.baseUrl}/root/children?$filter=endsWith(name,'.md')&$orderby=lastModifiedDateTime desc`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OneDrive] List failed:', response.status, errorText);
        throw new Error(`Failed to list documents: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      console.log('[OneDrive] Found', data.value?.length || 0, 'documents');
      
      return data.value || [];
    } catch (error) {
      console.error('[OneDrive] List error:', error);
      throw error;
    }
  }

  /**
   * Get a specific document's content and metadata
   */
  async getDocument(fileId: string): Promise<{ content: string; metadata: OneDriveFile }> {
    console.log('[OneDrive] Fetching document:', fileId);
    
    try {
      // Fetch metadata
      const metadataResponse = await fetch(
        `${this.baseUrl}/items/${fileId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text();
        console.error('[OneDrive] Metadata fetch failed:', metadataResponse.status, errorText);
        throw new Error(`Failed to fetch metadata: ${metadataResponse.status}`);
      }

      const metadata = await metadataResponse.json();

      // Fetch content
      const contentResponse = await fetch(
        `${this.baseUrl}/items/${fileId}/content`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!contentResponse.ok) {
        const errorText = await contentResponse.text();
        console.error('[OneDrive] Content fetch failed:', contentResponse.status, errorText);
        throw new Error(`Failed to fetch content: ${contentResponse.status}`);
      }

      const content = await contentResponse.text();
      console.log('[OneDrive] Document fetched successfully, size:', content.length, 'bytes');

      return { content, metadata };
    } catch (error) {
      console.error('[OneDrive] Get document error:', error);
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
  ): Promise<OneDriveFile> {
    console.log('[OneDrive] Saving document:', title, 'ID:', fileId);
    
    if (fileId) {
      return await this.updateFile(fileId, content);
    } else {
      return await this.createFile(title, content);
    }
  }

  /**
   * Create a new file in OneDrive
   */
  async createFile(title: string, content: string): Promise<OneDriveFile> {
    console.log('[OneDrive] Creating new file:', title);
    
    try {
      const fileName = title.endsWith('.md') ? title : `${title}.md`;
      
      // Create file with content using simple upload
      const response = await fetch(
        `${this.baseUrl}/root:/${encodeURIComponent(fileName)}:/content`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'text/markdown',
          },
          body: content,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OneDrive] Create failed:', response.status, errorText);
        throw new Error(`Failed to create file: ${response.status} ${errorText}`);
      }

      const file = await response.json();
      console.log('[OneDrive] File created successfully:', file.id);
      
      return file;
    } catch (error) {
      console.error('[OneDrive] Create error:', error);
      throw error;
    }
  }

  /**
   * Update an existing file's content
   */
  async updateFile(fileId: string, content: string): Promise<OneDriveFile> {
    console.log('[OneDrive] Updating file:', fileId);
    
    try {
      // Update content
      const updateResponse = await fetch(
        `${this.baseUrl}/items/${fileId}/content`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'text/markdown',
          },
          body: content,
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[OneDrive] Update failed:', updateResponse.status, errorText);
        throw new Error(`Failed to update file: ${updateResponse.status} ${errorText}`);
      }

      const file = await updateResponse.json();
      console.log('[OneDrive] File updated successfully:', file.id);
      
      return file;
    } catch (error) {
      console.error('[OneDrive] Update error:', error);
      throw error;
    }
  }

  /**
   * Delete a file from OneDrive
   */
  async deleteFile(fileId: string): Promise<void> {
    console.log('[OneDrive] Deleting file:', fileId);
    
    try {
      const response = await fetch(
        `${this.baseUrl}/items/${fileId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[OneDrive] Delete failed:', response.status, errorText);
        throw new Error(`Failed to delete file: ${response.status} ${errorText}`);
      }

      console.log('[OneDrive] File deleted successfully');
    } catch (error) {
      console.error('[OneDrive] Delete error:', error);
      throw error;
    }
  }
}
