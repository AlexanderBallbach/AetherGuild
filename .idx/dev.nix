{ pkgs, ... }: {
  # Let Nix fetch packages from the unstable channel
  channel = "unstable-23.11"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20 # Pinned to Node.js 20
    pkgs.google-cloud-sdk
    pkgs.nodePackages.firebase-tools
    pkgs.jdk17
  ];

  # Sets environment variables in the workspace
  env = {};

  # Defines services that should be running in the background
  idx.extensions = [
  ];

  # Workspace lifecycle hooks
  idx.workspace = {
    # Runs when a workspace is first created
    onCreate = {
      # Example: install JS dependencies from NPM
      npm-install = "npm install";
    };
    # Runs when the workspace is (re)started)
    onStart = {
      # Example: start a background task to watch and re-build backend code
      # watch-backend = "npm run watch-backend";
    };
  };
}
