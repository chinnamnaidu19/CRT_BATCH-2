-- EduSwap database schema (MySQL 8.0+)
-- Run: mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS eduswap
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eduswap;

-- 1. users -------------------------------------------------------------
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  college        VARCHAR(150) NOT NULL,
  department     VARCHAR(100) NOT NULL,
  academic_year  TINYINT UNSIGNED NOT NULL,
  profile_image  VARCHAR(255) NULL,
  role           ENUM('student','admin') NOT NULL DEFAULT 'student',
  status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_year CHECK (academic_year BETWEEN 1 AND 6),
  INDEX idx_users_college (college),
  INDEX idx_users_role_status (role, status)
) ENGINE=InnoDB;

-- 2. categories --------------------------------------------------------
CREATE TABLE categories (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name  VARCHAR(100) NOT NULL UNIQUE,
  slug  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- 3. items (listing_type 'auction' => see auctions/bids below) -------------------------------------------------------------
CREATE TABLE items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id        INT UNSIGNED NOT NULL,
  category_id     INT UNSIGNED NOT NULL,
  title           VARCHAR(150) NOT NULL,
  description     TEXT NOT NULL,
  listing_type    ENUM('sale','exchange','both','auction') NOT NULL,
  item_condition  ENUM('like_new','good','fair') NOT NULL,
  price           DECIMAL(10,2) NULL,
  college         VARCHAR(150) NOT NULL,
  status          ENUM('available','reserved','sold','exchanged') NOT NULL DEFAULT 'available',
  is_removed      TINYINT(1) NOT NULL DEFAULT 0,  -- admin moderation (soft delete)
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_owner    FOREIGN KEY (owner_id)    REFERENCES users(id)      ON DELETE CASCADE,
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES categories(id),
  -- Auction items keep their prices in `auctions`, so items.price stays NULL for them.
  CONSTRAINT chk_items_price CHECK (
    (listing_type = 'exchange' AND (price IS NULL OR price >= 0)) OR
    (listing_type IN ('sale','both') AND price IS NOT NULL AND price >= 0) OR
    (listing_type = 'auction' AND price IS NULL)
  ),
  INDEX idx_items_browse (status, is_removed, created_at),
  INDEX idx_items_category (category_id),
  INDEX idx_items_owner (owner_id),
  INDEX idx_items_price (price),
  FULLTEXT INDEX ft_items_search (title, description)
) ENGINE=InnoDB;

-- 4. item_images -------------------------------------------------------
CREATE TABLE item_images (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id     INT UNSIGNED NOT NULL,
  image_path  VARCHAR(255) NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_images_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  INDEX idx_images_item (item_id)
) ENGINE=InnoDB;

-- 4b. auctions (one per auction-type item) ------------------------------
CREATE TABLE auctions (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id            INT UNSIGNED NOT NULL UNIQUE,
  starting_price     DECIMAL(10,2) NOT NULL,
  min_increment      DECIMAL(10,2) NOT NULL DEFAULT 10.00,
  current_price      DECIMAL(10,2) NOT NULL,          -- starting_price until the first bid, then the highest bid
  highest_bidder_id  INT UNSIGNED NULL,
  bid_count          INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at            DATETIME NOT NULL,               -- stored in UTC
  status             ENUM('active','ended','cancelled') NOT NULL DEFAULT 'active',
  winner_id          INT UNSIGNED NULL,
  final_price        DECIMAL(10,2) NULL,
  ended_at           DATETIME NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_auc_item   FOREIGN KEY (item_id)           REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_auc_high   FOREIGN KEY (highest_bidder_id) REFERENCES users(id),
  CONSTRAINT fk_auc_winner FOREIGN KEY (winner_id)         REFERENCES users(id),
  CONSTRAINT chk_auc_prices CHECK (starting_price > 0 AND min_increment > 0 AND current_price >= starting_price),
  CONSTRAINT chk_auc_dates  CHECK (ends_at > starts_at),
  INDEX idx_auc_status_end (status, ends_at)
) ENGINE=InnoDB;

-- 4c. bids (append-only) ------------------------------------------------
CREATE TABLE bids (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  auction_id  INT UNSIGNED NOT NULL,
  bidder_id   INT UNSIGNED NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bid_auction FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
  CONSTRAINT fk_bid_bidder  FOREIGN KEY (bidder_id)  REFERENCES users(id),
  CONSTRAINT chk_bid_amount CHECK (amount > 0),
  INDEX idx_bid_auction_amount (auction_id, amount),
  INDEX idx_bid_bidder (bidder_id)
) ENGINE=InnoDB;

-- 5. exchange_requests (purchase + exchange requests) -----------------
CREATE TABLE exchange_requests (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_type       ENUM('purchase','exchange') NOT NULL,
  requester_id       INT UNSIGNED NOT NULL,
  owner_id           INT UNSIGNED NOT NULL,
  requested_item_id  INT UNSIGNED NOT NULL,
  offered_item_id    INT UNSIGNED NULL,           -- required for exchange
  message            VARCHAR(500) NULL,
  status             ENUM('pending','accepted','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_id)      REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_owner     FOREIGN KEY (owner_id)          REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_requested FOREIGN KEY (requested_item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_offered   FOREIGN KEY (offered_item_id)   REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT chk_req_not_self CHECK (requester_id <> owner_id),
  CONSTRAINT chk_req_type CHECK (
    (request_type = 'purchase' AND offered_item_id IS NULL) OR
    (request_type = 'exchange' AND offered_item_id IS NOT NULL)
  ),
  INDEX idx_req_owner_status (owner_id, status),
  INDEX idx_req_requester_status (requester_id, status),
  INDEX idx_req_item_status (requested_item_id, status)
) ENGINE=InnoDB;

-- 6. transactions ------------------------------------------------------
CREATE TABLE transactions (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id            INT UNSIGNED NULL UNIQUE,       -- set for purchase/exchange (one per accepted request)
  auction_id            INT UNSIGNED NULL UNIQUE,       -- set for auction wins (one per auction)
  transaction_type      ENUM('purchase','exchange','auction') NOT NULL,
  requester_id          INT UNSIGNED NOT NULL,
  owner_id              INT UNSIGNED NOT NULL,
  item_id               INT UNSIGNED NOT NULL,
  offered_item_id       INT UNSIGNED NULL,
  agreed_price          DECIMAL(10,2) NULL,
  requester_confirmed   TINYINT(1) NOT NULL DEFAULT 0,
  owner_confirmed       TINYINT(1) NOT NULL DEFAULT 0,
  status                ENUM('in_progress','completed','cancelled') NOT NULL DEFAULT 'in_progress',
  completed_at          TIMESTAMP NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tx_request   FOREIGN KEY (request_id)      REFERENCES exchange_requests(id),
  CONSTRAINT fk_tx_auction   FOREIGN KEY (auction_id)      REFERENCES auctions(id),
  CONSTRAINT fk_tx_requester FOREIGN KEY (requester_id)    REFERENCES users(id),
  CONSTRAINT fk_tx_owner     FOREIGN KEY (owner_id)        REFERENCES users(id),
  CONSTRAINT fk_tx_item      FOREIGN KEY (item_id)         REFERENCES items(id),
  CONSTRAINT fk_tx_offered   FOREIGN KEY (offered_item_id) REFERENCES items(id),
  CONSTRAINT chk_tx_source CHECK (
    (request_id IS NOT NULL AND auction_id IS NULL AND transaction_type IN ('purchase','exchange')) OR
    (request_id IS NULL AND auction_id IS NOT NULL AND transaction_type = 'auction')
  ),
  INDEX idx_tx_requester (requester_id, status),
  INDEX idx_tx_owner (owner_id, status),
  INDEX idx_tx_item (item_id)
) ENGINE=InnoDB;

-- 7. conversations & messages -----------------------------------------
CREATE TABLE conversations (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_a_id    INT UNSIGNED NOT NULL,   -- always the smaller user id (enforced in app + check)
  user_b_id    INT UNSIGNED NOT NULL,   -- always the larger user id
  item_id      INT UNSIGNED NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_a    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_b    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_item FOREIGN KEY (item_id)   REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT chk_conv_order CHECK (user_a_id < user_b_id),
  UNIQUE KEY uq_conv_pair_item (user_a_id, user_b_id, item_id),
  INDEX idx_conv_b (user_b_id)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id  INT UNSIGNED NOT NULL,
  sender_id        INT UNSIGNED NOT NULL,
  body             VARCHAR(2000) NOT NULL,
  is_read          TINYINT(1) NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conv   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id)       REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_msg_conv_time (conversation_id, created_at)
) ENGINE=InnoDB;

-- 8. notifications -----------------------------------------------------
CREATE TABLE notifications (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  type         ENUM('request_received','request_accepted','request_rejected',
                    'request_cancelled','transaction_completed','new_message','review_received',
                    'bid_received','outbid','auction_won','auction_ended',
                    'transaction_confirmed','transaction_cancelled','listing_removed') NOT NULL,
  title        VARCHAR(150) NOT NULL,
  body         VARCHAR(500) NULL,
  related_id   INT UNSIGNED NULL,       -- request / transaction / conversation id
  is_read      TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB;

-- 9. reviews -----------------------------------------------------------
CREATE TABLE reviews (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  transaction_id  INT UNSIGNED NOT NULL,
  reviewer_id     INT UNSIGNED NOT NULL,
  reviewee_id     INT UNSIGNED NOT NULL,
  rating          TINYINT UNSIGNED NOT NULL,
  comment         VARCHAR(1000) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rev_tx       FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_reviewer FOREIGN KEY (reviewer_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_reviewee FOREIGN KEY (reviewee_id)    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_rev_rating  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_rev_not_self CHECK (reviewer_id <> reviewee_id),
  UNIQUE KEY uq_review_once (transaction_id, reviewer_id),
  INDEX idx_rev_reviewee (reviewee_id)
) ENGINE=InnoDB;

-- 10. reports ----------------------------------------------------------
CREATE TABLE reports (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reporter_id       INT UNSIGNED NOT NULL,
  reported_item_id  INT UNSIGNED NULL,
  reported_user_id  INT UNSIGNED NULL,
  reason            VARCHAR(100) NOT NULL,
  details           VARCHAR(1000) NULL,
  status            ENUM('open','resolved','dismissed') NOT NULL DEFAULT 'open',
  resolved_by       INT UNSIGNED NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rep_reporter FOREIGN KEY (reporter_id)      REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_item     FOREIGN KEY (reported_item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_user     FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_admin    FOREIGN KEY (resolved_by)      REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_rep_target  CHECK (reported_item_id IS NOT NULL OR reported_user_id IS NOT NULL),
  INDEX idx_rep_status (status)
) ENGINE=InnoDB;

-- 11. wishlist (optional page 15) --------------------------------------
CREATE TABLE wishlist (
  user_id     INT UNSIGNED NOT NULL,
  item_id     INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id),
  CONSTRAINT fk_wish_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wish_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Seed: categories ------------------------------------------------------
INSERT INTO categories (name, slug) VALUES
  ('Textbooks and reference books',     'textbooks'),
  ('Engineering drawing kits',          'drawing-kits'),
  ('Scientific calculators',            'calculators'),
  ('Lab coats and aprons',              'lab-coats'),
  ('Laboratory equipment',              'lab-equipment'),
  ('Electronics and accessories',       'electronics'),
  ('Study notes and academic materials','study-notes'),
  ('Other college essentials',          'other');

-- Sample users, items and the admin account are created by the Node seed
-- script (backend/seed.js) so passwords are bcrypt-hashed, never stored in plain text.
