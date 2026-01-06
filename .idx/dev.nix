{ pkgs, ... }: {
  # Let Nix fetch packages from the unstable channel
  channel = "unstable-23.11"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20 # Pinned to Node.js 20
    pkgs.google-cloud-sdk
    (pkgs.runCommand "firebase-tools" {} '''
      mkdir -p $out/bin
      npm install -g firebase-tools
      ln -s $out/lib/node_modules/firebase-tools/bin/firebase $out/bin/firebase
    ''')
  ];
  # Sets environment variables in the workspace
  env = {};
  # Defines services that should be running in the background
  services = {};
  # Enable previews
  previews = {
    enable = true;
    web = {
      # Example: run "npm run dev" with PORT set to IDX's defined port for previews,
      # and show it in IDX's web preview panel
      command = [
        "firebase"
        "emulators:start"
        "--only"
        "hosting,auth,firestore"
      ];
      manager = "web";
    };
  };

  # Workspace lifecycle hooks
  workspace = {
    # Runs when a workspace is first created
    onCreate = {
      # Example: install JS dependencies from NPM
      npm-install = "npm install";
    };
    # Runs when the workspace is (re)started
    onStart = {
      # Example: start a background task to watch and re-build backend code
      # watch-backend = "npm run watch-backend";
    };
  };
}
