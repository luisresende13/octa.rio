# Deployment Instructions for Octa.Rio (Nginx)

This document outlines the steps to deploy the `octa.rio` project to the remote VM via `gcloud compute ssh`, serving it with Nginx at `rio.octacity.org`.

## Prerequisites

1.  Ensure you have the `gcloud` CLI installed and configured.
2.  The project directory is `octa.rio`.
3.  The target directory on the remote machine is `/var/www/rio.octacity.org`.
4.  The remote VM is accessible via `cpd-niteroi-proxy`.
5.  **Nginx** is installed and running on the remote VM.
6.  **DNS** for `rio.octacity.org` is configured to point to the VM's IP address.

## Nginx Configuration (First Time Setup)

If the Nginx server block for this subdomain does not exist yet, follow these steps on the remote VM.

1.  **Create the server block config:**
    
    Create a file at `/etc/nginx/sites-available/rio.octacity.org`:

    ```bash
    gcloud compute ssh cpd-niteroi-proxy --command "sudo nano /etc/nginx/sites-available/rio.octacity.org"
    ```
    
    Paste the following content: 

    ```nginx
    server {
        server_name rio.octacity.org;
        root /var/www/rio.octacity.org;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }
    }
    ```

    Press 'ctrl + O' -> 'Enter' to save and 'ctrl + X' to exit the editor.

2.  **Enable the site:**

    ```bash
    sudo ln -s /etc/nginx/sites-available/rio.octacity.org /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl reload nginx
    ```

3.  **Enable HTTPS:**
    
    Use Certbot to install the SSL certificate and configure HTTPS:

    ```bash
    sudo certbot --nginx -d rio.octacity.org
    ```

## Deployment Steps

### 1. Local Preparation

1.  **Navigate to the application directory:**
    First, ensure you are inside the `octa.rio` directory. Do not assume a previous working directory.
    ```bash
    # Example if starting from workspace root:
    cd octa.rio
    ```

2.  **Zip the project contents:**
    Zip the contents of the current directory into `octa.rio.zip`.
    ```bash
    
    zip -r octa.rio.zip ./* -x "node_modules/*"
    ```

3.  **Upload the zip file to the VM:**
    Use `gcloud compute scp` to upload the file to the user's home directory (`~`).
    ```bash
    gcloud compute scp octa.rio.zip cpd-niteroi-proxy:~
    ```

### 2. Remote Deployment via SSH

Execute the following sequence of commands on the remote VM using `gcloud compute ssh`. This will replace the contents of the target directory with the new build.

```bash
gcloud compute ssh cpd-niteroi-proxy --command "
    # 1. Remove old deployment directory (clean slate)
    sudo rm -rf /var/www/rio.octacity.org &&

    # 2. Create the target directory
    sudo mkdir -p /var/www/rio.octacity.org &&

    # 3. Unzip the uploaded file to the target location
    sudo unzip -o ~/octa.rio.zip -d /var/www/rio.octacity.org &&

    # 4. Update permissions for Nginx (www-data)
    sudo chown -R www-data:www-data /var/www/rio.octacity.org &&
    sudo chmod -R 755 /var/www/rio.octacity.org &&

    # 5. Clean up the uploaded zip file from the home directory
    rm ~/octa.rio.zip
"
```

### 3. Post-Deployment (Cleanup)

Remove the local zip file generated in step 1.

```bash
rm octa.rio.zip
```