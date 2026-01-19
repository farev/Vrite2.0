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
  private vwriteFolderId: string | null = null;
  private readonly FOLDER_NAME = 'vwrite';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Find or create the vwrite folder in Google Drive
   */
  private async findOrCreateVwriteFolder(): Promise<string> {
    if (this.vwriteFolderId) {
      return this.vwriteFolderId;
    }

    console.log('[GoogleDrive] Finding or creating vwrite folder');

    try {
      // First, try to find existing folder
      const query = encodeURIComponent(
        `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );

      const searchResponse = await fetch(
        `${this.baseUrl}/files?q=${query}&fields=files(id,name)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.files && searchData.files.length > 0) {
          this.vwriteFolderId = searchData.files[0].id;
          console.log('[GoogleDrive] Found existing vwrite folder:', this.vwriteFolderId);
          return this.vwriteFolderId;
        }
      }

      // Folder doesn't exist, create it
      console.log('[GoogleDrive] Creating new vwrite folder');

      const createResponse = await fetch(
        `${this.baseUrl}/files`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: this.FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder',
          }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('[GoogleDrive] Failed to create vwrite folder:', createResponse.status, errorText);
        throw new Error(`Failed to create vwrite folder: ${createResponse.status} ${errorText}`);
      }

      const folderData = await createResponse.json();
      this.vwriteFolderId = folderData.id;
      console.log('[GoogleDrive] Created vwrite folder:', this.vwriteFolderId);

      return this.vwriteFolderId;
    } catch (error) {
      console.error('[GoogleDrive] Error with vwrite folder:', error);
      // Instead of falling back to root, let's try to create the folder again with a different approach
      console.warn('[GoogleDrive] Attempting alternative folder creation');

      try {
        // Try creating folder with explicit parent (root)
        const createResponse = await fetch(
          `${this.baseUrl}/files`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: this.FOLDER_NAME,
              mimeType: 'application/vnd.google-apps.folder',
              parents: ['root'],
            }),
          }
        );

        if (createResponse.ok) {
          const folderData = await createResponse.json();
          this.vwriteFolderId = folderData.id;
          console.log('[GoogleDrive] Created vwrite folder with explicit parent:', this.vwriteFolderId);
          return this.vwriteFolderId;
        } else {
          const errorText = await createResponse.text();
          console.error('[GoogleDrive] Alternative folder creation also failed:', createResponse.status, errorText);
        }
      } catch (altError) {
        console.error('[GoogleDrive] Alternative folder creation error:', altError);
      }

      // Final fallback to root directory if all folder operations fail
      console.warn('[GoogleDrive] All folder creation attempts failed, falling back to root directory');
      return 'root';
    }
  }

  /**
   * List all markdown documents in Drive
   * Returns files ordered by most recently modified
   */
  async listDocuments(): Promise<DriveFile[]> {
    console.log('[GoogleDrive] Listing documents');

    try {
      // Get the vwrite folder ID
      const folderId = await this.findOrCreateVwriteFolder();

      // First try to find files in the vwrite folder
      const folderQuery = encodeURIComponent(
        `mimeType='text/markdown' and '${folderId}' in parents and trashed=false`
      );

      const folderResponse = await fetch(
        `${this.baseUrl}/files?q=${folderQuery}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!folderResponse.ok) {
        const errorText = await folderResponse.text();
        console.error('[GoogleDrive] Folder list failed:', folderResponse.status, errorText);
        throw new Error(`Failed to list documents in folder: ${folderResponse.status} ${errorText}`);
      }

      const folderData = await folderResponse.json();
      const folderFiles = folderData.files || [];
      console.log('[GoogleDrive] Found', folderFiles.length, 'documents in vwrite folder');

      // If we found files in the folder, return them
      if (folderFiles.length > 0) {
        return folderFiles;
      }

      // If no files in folder, also check root directory for any existing files
      // This handles the case where files were created before the folder existed
      console.log('[GoogleDrive] No files in vwrite folder, checking root directory');

      const rootQuery = encodeURIComponent(
        `mimeType='text/markdown' and 'root' in parents and trashed=false and name contains 'vwrite'`
      );

      const rootResponse = await fetch(
        `${this.baseUrl}/files?q=${rootQuery}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (rootResponse.ok) {
        const rootData = await rootResponse.json();
        const rootFiles = rootData.files || [];
        console.log('[GoogleDrive] Found', rootFiles.length, 'legacy documents in root directory');

        // If we found legacy files in root, we should move them to the vwrite folder
        if (rootFiles.length > 0) {
          console.log('[GoogleDrive] Moving legacy files to vwrite folder');
          for (const file of rootFiles) {
            try {
              await this.moveFileToFolder(file.id, folderId);
            } catch (moveError) {
              console.warn('[GoogleDrive] Failed to move file', file.id, 'to folder:', moveError);
            }
          }
          // Return the moved files
          return rootFiles;
        }
      }

      return [];
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
      return await this.updateFile(fileId, content, title);
    } else {
      return await this.createFile(title, content);
    }
  }

  /**
   * Create a new file in Google Drive
   * First checks if a file with the same name exists to avoid duplicates
   */
  async createFile(title: string, content: string): Promise<DriveFile> {
    console.log('[GoogleDrive] Creating new file:', title);

    try {
      const fileName = title.endsWith('.md') ? title : `${title}.md`;
      
      // Get the vwrite folder ID
      const folderId = await this.findOrCreateVwriteFolder();

      // Check if a file with this name already exists in the folder
      const query = encodeURIComponent(
        `name='${fileName}' and '${folderId}' in parents and trashed=false`
      );

      const searchResponse = await fetch(
        `${this.baseUrl}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.files && searchData.files.length > 0) {
          // File already exists, update it instead of creating a new one
          const existingFile = searchData.files[0];
          console.log('[GoogleDrive] File with same name exists, updating instead:', existingFile.id);
          return await this.updateFile(existingFile.id, content, title);
        }
      }

      // File doesn't exist, create it
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata: DriveFileMetadata = {
        name: fileName,
        mimeType: 'text/markdown',
        // Only set parents if it's not root (root is default)
        ...(folderId !== 'root' && { parents: [folderId] }),
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
   * Update an existing file's content and optionally rename it
   */
  async updateFile(fileId: string, content: string, newTitle?: string): Promise<DriveFile> {
    console.log('[GoogleDrive] Updating file:', fileId, newTitle ? `with new title: ${newTitle}` : '');

    try {
      let fileName: string | undefined;
      let shouldRename = false;

      // Get the vwrite folder ID
      const folderId = await this.findOrCreateVwriteFolder();

      // Check if file is in the correct folder
      const currentMetadataResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?fields=name,parents`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      let currentParents: string[] = [];
      let currentMetadata: any = null;
      
      if (currentMetadataResponse.ok) {
        currentMetadata = await currentMetadataResponse.json();
        currentParents = currentMetadata.parents || [];

        // Check if file needs to be moved to the correct folder
        const isInCorrectFolder = folderId === 'root' ? currentParents.includes('root') || currentParents.length === 0 : currentParents.includes(folderId);
        if (!isInCorrectFolder) {
          console.log('[GoogleDrive] File not in correct folder, moving it');
          try {
            await this.moveFileToFolder(fileId, folderId);
          } catch (moveError) {
            console.warn('[GoogleDrive] Failed to move file to correct folder:', moveError);
          }
        }
      }

      // If title is provided, check if it has changed
      if (newTitle) {
        const desiredFileName = newTitle.endsWith('.md') ? newTitle : `${newTitle}.md`;

        if (currentMetadata) {
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
            `${this.baseUrl}/files/${fileId}`,
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
            console.error('[GoogleDrive] Metadata update failed:', metadataUpdateResponse.status, errorText);
            // Continue with content update even if rename fails
          } else {
            console.log('[GoogleDrive] File renamed successfully');
          }
        }
      }

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
        console.error('[GoogleDrive] Content update failed:', updateResponse.status, errorText);
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
          name: fileName || 'Unknown',
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
   * Move a file to a different folder
   */
  async moveFileToFolder(fileId: string, folderId: string): Promise<void> {
    console.log('[GoogleDrive] Moving file', fileId, 'to folder', folderId);

    try {
      // First get current parents
      const currentParentsResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?fields=parents`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!currentParentsResponse.ok) {
        throw new Error('Failed to get current file parents');
      }

      const currentParentsData = await currentParentsResponse.json();
      const currentParents = currentParentsData.parents || [];

      // Remove current parents and add new parent
      const updateResponse = await fetch(
        `${this.baseUrl}/files/${fileId}?addParents=${folderId}&removeParents=${currentParents.join(',')}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('[GoogleDrive] Move failed:', updateResponse.status, errorText);
        throw new Error(`Failed to move file: ${updateResponse.status} ${errorText}`);
      }

      console.log('[GoogleDrive] File moved successfully');
    } catch (error) {
      console.error('[GoogleDrive] Move error:', error);
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
