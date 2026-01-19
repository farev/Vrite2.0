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
  private vwriteFolderId: string | null = null;
  private readonly FOLDER_NAME = 'vwrite';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Find or create the vwrite folder in OneDrive
   */
  private async findOrCreateVwriteFolder(): Promise<string> {
    if (this.vwriteFolderId) {
      return this.vwriteFolderId;
    }

    console.log('[OneDrive] Finding or creating vwrite folder');

    try {
      // First, try to find existing folder in root
      const searchResponse = await fetch(
        `${this.baseUrl}/root/children?$filter=name eq '${this.FOLDER_NAME}' and folder ne null`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.value && searchData.value.length > 0) {
          this.vwriteFolderId = searchData.value[0].id;
          console.log('[OneDrive] Found existing vwrite folder:', this.vwriteFolderId);
          return this.vwriteFolderId;
        }
      }

      // Folder doesn't exist, create it
      console.log('[OneDrive] Creating new vwrite folder');

      const createResponse = await fetch(
        `${this.baseUrl}/root/children`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: this.FOLDER_NAME,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'rename',
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('[OneDrive] Failed to create vwrite folder:', createResponse.status, errorText);
        throw new Error(`Failed to create vwrite folder: ${createResponse.status} ${errorText}`);
      }

      const folderData = await createResponse.json();
      this.vwriteFolderId = folderData.id;
      console.log('[OneDrive] Created vwrite folder:', this.vwriteFolderId);

      return this.vwriteFolderId;
    } catch (error) {
      console.error('[OneDrive] Error with vwrite folder:', error);
      // Fallback to root directory if folder operations fail
      console.warn('[OneDrive] Falling back to root directory');
      return 'root';
    }
  }

  /**
   * List all markdown documents in OneDrive
   * Returns files ordered by most recently modified
   */
  async listDocuments(): Promise<OneDriveFile[]> {
    console.log('[OneDrive] Listing documents');

    try {
      // Get the vwrite folder ID
      const folderId = await this.findOrCreateVwriteFolder();

      // List files in vwrite folder, filter for .md files
      const response = await fetch(
        `${this.baseUrl}/items/${folderId}/children?$filter=endsWith(name,'.md')&$orderby=lastModifiedDateTime desc`,
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
      console.log('[OneDrive] Found', data.value?.length || 0, 'documents in vwrite folder');

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
      return await this.updateFile(fileId, content, title);
    } else {
      return await this.createFile(title, content);
    }
  }

  /**
   * Create a new file in OneDrive
   * Note: OneDrive's PUT API automatically updates if file exists, so no duplicate check needed
   */
  async createFile(title: string, content: string): Promise<OneDriveFile> {
    console.log('[OneDrive] Creating new file:', title);

    try {
      const fileName = title.endsWith('.md') ? title : `${title}.md`;

      // Get the vwrite folder ID
      const folderId = await this.findOrCreateVwriteFolder();

      // Check if file already exists
      const checkResponse = await fetch(
        `${this.baseUrl}/items/${folderId}:/${encodeURIComponent(fileName)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (checkResponse.ok) {
        // File exists, update it instead
        const existingFile = await checkResponse.json();
        console.log('[OneDrive] File with same name exists, updating instead:', existingFile.id);
        return await this.updateFile(existingFile.id, content, title);
      }

      // Create file with content using simple upload in vwrite folder
      const response = await fetch(
        `${this.baseUrl}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`,
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
      console.log('[OneDrive] File created successfully in vwrite folder:', file.id);

      return file;
    } catch (error) {
      console.error('[OneDrive] Create error:', error);
      throw error;
    }
  }

  /**
   * Update an existing file's content and optionally rename it
   */
  async updateFile(fileId: string, content: string, newTitle?: string): Promise<OneDriveFile> {
    console.log('[OneDrive] Updating file:', fileId, newTitle ? `with new title: ${newTitle}` : '');

    try {
      let fileName: string | undefined;
      let shouldRename = false;

      // If title is provided, check if it has changed
      if (newTitle) {
        const desiredFileName = newTitle.endsWith('.md') ? newTitle : `${newTitle}.md`;

        // Get current file metadata to check current name
        const currentMetadataResponse = await fetch(
          `${this.baseUrl}/items/${fileId}?select=name`,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
            },
          }
        );

        if (currentMetadataResponse.ok) {
          const currentMetadata = await currentMetadataResponse.json();
          shouldRename = currentMetadata.name !== desiredFileName;
          fileName = desiredFileName;
        } else {
          // If we can't get current metadata, assume we should rename
          shouldRename = true;
          fileName = desiredFileName;
        }

        // Update the file metadata if rename is needed
        if (shouldRename) {
          const metadataUpdateResponse = await fetch(
            `${this.baseUrl}/items/${fileId}`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                name: fileName,
              }),
            }
          );

          if (!metadataUpdateResponse.ok) {
            const errorText = await metadataUpdateResponse.text();
            console.error('[OneDrive] Metadata update failed:', metadataUpdateResponse.status, errorText);
            // Continue with content update even if rename fails
          } else {
            console.log('[OneDrive] File renamed successfully');
          }
        }
      }

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
        console.error('[OneDrive] Content update failed:', updateResponse.status, errorText);
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
