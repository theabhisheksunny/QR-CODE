CREATE TABLE shared_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_file_name VARCHAR(255) NOT NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    content_type VARCHAR(255),
    file_size BIGINT,
    token_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    download_count INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

CREATE INDEX idx_shared_files_token_hash ON shared_files(token_hash);
CREATE INDEX idx_shared_files_expires_at ON shared_files(expires_at);
CREATE INDEX idx_shared_files_status ON shared_files(status);
