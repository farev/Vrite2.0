'use client';

import { useState, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import {
  shouldShowMigrationPrompt,
  migrateLegacyDocument,
  markMigrationCompleted,
  type MigrationResult,
} from '@/lib/migrate-local-storage';

export default function MigrationPrompt() {
  const [show, setShow] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  useEffect(() => {
    // Check if migration prompt should be shown
    if (shouldShowMigrationPrompt()) {
      setShow(true);
    }
  }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const migrationResult = await migrateLegacyDocument();
      setResult(migrationResult);
      
      if (migrationResult.success) {
        markMigrationCompleted();
        // Auto-close after 3 seconds on success
        setTimeout(() => {
          setShow(false);
        }, 3000);
      }
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleSkip = () => {
    markMigrationCompleted();
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Migrate Your Document
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Found a document in local storage
              </p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={migrating}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!result ? (
          <>
            <div className="mb-6">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                We found a document saved in your browser's local storage. Would you like to migrate it to your Supabase account?
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Access from any device</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Automatic backups</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>Version history</span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {migrating ? 'Migrating...' : 'Migrate Document'}
              </button>
              <button
                onClick={handleSkip}
                disabled={migrating}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Skip
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Result */}
            <div className="mb-6">
              {result.success ? (
                <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900 dark:text-green-100">
                      Migration Successful!
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Your document has been migrated to Supabase. You can now access it from any device.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-900 dark:text-red-100">
                      Migration Failed
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {result.error || 'An error occurred during migration.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => setShow(false)}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 font-medium"
            >
              Close
            </button>
          </>
        )}

        {/* Note */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
          Your local document will be kept as a backup
        </p>
      </div>
    </div>
  );
}
