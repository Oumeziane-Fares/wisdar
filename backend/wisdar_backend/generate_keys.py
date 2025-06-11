import os
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

# This script generates a secure RSA private key for encrypting API keys.
# It only needs to be run once.

def generate_and_save_keys():
    """
    Generates a 2048-bit RSA private key and saves it to a file
    named 'rsa_private_key.pem' in the PEM format.
    """
    print("Generating a new RSA private key...")

    # Generate the private key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Serialize the private key to the PEM format
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Define the file path
    file_path = "rsa_private_key.pem"

    # Save the key to the file
    with open(file_path, "wb") as f:
        f.write(pem)

    print(f"Success! Private key saved to '{file_path}'.")
    print("\n--- IMPORTANT NEXT STEPS ---")
    print("1. Open the 'rsa_private_key.pem' file.")
    print("2. Copy the ENTIRE content (including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----).")
    print("3. Open your '.env' file.")
    print("4. Add a new line like this, pasting the key inside quotes:")
    print('   RSA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIC...\\n-----END PRIVATE KEY-----"')
    print("5. Make sure to format the key as a single-line string with '\\n' for newlines inside the quotes.")
    print("6. You can delete the 'rsa_private_key.pem' file after adding it to your .env file for security.")


if __name__ == "__main__":
    generate_and_save_keys()
