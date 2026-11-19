# Bitrise: unsigned iOS IPA

The repository's Bitrise build must create an unsigned archive and package the `.app` itself. The Bitrise **Xcode Archive & Export for iOS** step performs an export flow that expects signing configuration; it is not the right step for this unsigned artifact.

## Configure the Bitrise workflow

1. Keep a Node.js 22 setup step before the build.
2. Remove or disable the **Xcode Archive & Export for iOS** step that currently fails.
3. Add a Bitrise **Script** step and run `bash scripts/build-ios-unsigned.sh`.
4. Add **Deploy to Bitrise.io** after the Script step. The script copies `aura-crm-ios-unsigned.ipa` into `$BITRISE_DEPLOY_DIR` for Bitrise to publish.

The script runs the same unsigned `xcodebuild archive` flags as the successful GitHub iOS workflow, then packages `App.app` under `Payload/` without running Xcode's signing/export step. No Apple Developer Team ID, certificate, or provisioning profile is needed for this artifact.

An unsigned IPA cannot be installed on a device or submitted to TestFlight/App Store until it is re-signed.
