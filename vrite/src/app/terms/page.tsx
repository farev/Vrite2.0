'use client';

export default function TermsPage() {
  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 h-screen overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Terms of Service
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Last updated: January 19, 2026
            </p>
          </div>

          <div className="prose prose-lg dark:prose-invert max-w-none">
            <div className="space-y-6 text-gray-700 dark:text-gray-300">
              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">1. Acceptance of Terms</h2>
                <p>
                  By accessing and using Vrite, you accept and agree to be bound by the terms and provision of this agreement.
                  If you do not agree to abide by the above, please do not use this service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">2. Use License</h2>
                <p>
                  Permission is granted to temporarily use Vrite for personal, non-commercial transitory viewing only.
                  This is the grant of a license, not a transfer of title, and under this license you may not:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>modify or copy the materials</li>
                  <li>use the materials for any commercial purpose or for any public display</li>
                  <li>attempt to decompile or reverse engineer any software contained on our platform</li>
                  <li>remove any copyright or other proprietary notations from the materials</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">3. User Accounts</h2>
                <p>
                  When you create an account with us, you must provide information that is accurate, complete, and current at all times.
                  You are responsible for safeguarding the password and for all activities that occur under your account.
                  You must immediately notify us of any unauthorized use of your account.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">4. Content and Conduct</h2>
                <p>
                  Our platform allows you to create and store documents. You are solely responsible for the content you create and share.
                  You agree not to use our service to:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>upload or share content that violates any laws or regulations</li>
                  <li>infringe on the intellectual property rights of others</li>
                  <li>distribute malware or harmful code</li>
                  <li>engage in any form of harassment or abusive behavior</li>
                </ul>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">5. Service Availability</h2>
                <p>
                  We strive to provide reliable service but cannot guarantee uninterrupted access.
                  We reserve the right to modify, suspend, or discontinue the service at any time without notice.
                  We are not liable for any damages resulting from service interruptions or modifications.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">6. Disclaimer</h2>
                <p>
                  The materials on Vrite are provided on an 'as is' basis. Vrite makes no warranties, expressed or implied, and hereby disclaims
                  and negates all other warranties including without limitation, implied warranties or conditions of merchantability,
                  fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">7. Limitations</h2>
                <p>
                  In no event shall Vrite or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit,
                  or due to business interruption) arising out of the use or inability to use Vrite, even if Vrite or a Vrite authorized representative
                  has been notified orally or in writing of the possibility of such damage.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">8. Accuracy of Materials</h2>
                <p>
                  The materials appearing on Vrite could include technical, typographical, or photographic errors. Vrite does not warrant that any of the
                  materials on its website are accurate, complete, or current. Vrite may make changes to the materials contained on its website at any time
                  without notice. However, Vrite does not make any commitment to update the materials.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">9. Modifications</h2>
                <p>
                  Vrite may revise these terms of service at any time without notice. By using this website, you are agreeing to be bound by the then current
                  version of these terms of service.
                </p>
              </section>

              <section>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">10. Contact Information</h2>
                <p>
                  If you have any questions about these Terms of Service, please contact us at legal@vrite.com.
                </p>
              </section>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="text-center">
              <a
                href="/login"
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Back to Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}