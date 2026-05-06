use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod ika_btc_policy {
    use super::*;

    pub fn initialize_policy(
        ctx: Context<InitializePolicy>,
        dwallet_secp256k1_public_key: Vec<u8>,
    ) -> Result<()> {
        require!(
            dwallet_secp256k1_public_key.len() == 33 || dwallet_secp256k1_public_key.len() == 65,
            PolicyError::InvalidDwalletPublicKey
        );

        let policy = &mut ctx.accounts.policy;
        policy.owner = ctx.accounts.owner.key();
        policy.bump = ctx.bumps.policy;
        policy.authority_bump = ctx.bumps.authority;
        policy.dwallet_secp256k1_public_key = dwallet_secp256k1_public_key;

        emit!(PolicyInitialized {
            owner: policy.owner,
            policy: policy.key(),
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }

    pub fn approve_btc_message(
        ctx: Context<ApproveBtcMessage>,
        bitcoin_sighash: [u8; 32],
        destination_script_pubkey: Vec<u8>,
        amount_sats: u64,
        fee_sats: u64,
        sighash_type: u8,
    ) -> Result<()> {
        require!(
            destination_script_pubkey.len() <= MessageApprovalRequest::MAX_DESTINATION_SCRIPT_BYTES,
            PolicyError::DestinationScriptTooLarge
        );
        require!(sighash_type == 1, PolicyError::UnsupportedSighashType);

        let approval = &mut ctx.accounts.approval;
        approval.policy = ctx.accounts.policy.key();
        approval.owner = ctx.accounts.owner.key();
        approval.bump = ctx.bumps.approval;
        approval.bitcoin_sighash = bitcoin_sighash;
        approval.destination_script_pubkey = destination_script_pubkey;
        approval.amount_sats = amount_sats;
        approval.fee_sats = fee_sats;
        approval.sighash_type = sighash_type;

        emit!(BtcMessageApproved {
            owner: approval.owner,
            policy: approval.policy,
            approval: approval.key(),
            bitcoin_sighash,
            amount_sats,
            fee_sats,
            sighash_type,
        });

        // TODO: Replace this event-only boundary with the Ika approve_message CPI
        // after the Solana dWallet program IDL and account list are pinned.
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePolicy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        space = SigningPolicy::SPACE,
        seeds = [b"policy", owner.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, SigningPolicy>,
    #[account(
        seeds = [b"authority", owner.key().as_ref()],
        bump
    )]
    /// CHECK: PDA signer authority. It carries no data in this shell program.
    pub authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bitcoin_sighash: [u8; 32])]
pub struct ApproveBtcMessage<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"policy", policy.owner.as_ref()],
        bump = policy.bump,
        has_one = owner
    )]
    pub policy: Account<'info, SigningPolicy>,
    #[account(
        init,
        payer = owner,
        space = MessageApprovalRequest::SPACE,
        seeds = [b"approval", policy.key().as_ref(), bitcoin_sighash.as_ref()],
        bump
    )]
    pub approval: Account<'info, MessageApprovalRequest>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct SigningPolicy {
    pub owner: Pubkey,
    pub bump: u8,
    pub authority_bump: u8,
    pub dwallet_secp256k1_public_key: Vec<u8>,
}

impl SigningPolicy {
    pub const MAX_DWALLET_PUBLIC_KEY_BYTES: usize = 65;
    pub const SPACE: usize = 8 + 32 + 1 + 1 + 4 + Self::MAX_DWALLET_PUBLIC_KEY_BYTES;
}

#[account]
pub struct MessageApprovalRequest {
    pub policy: Pubkey,
    pub owner: Pubkey,
    pub bump: u8,
    pub bitcoin_sighash: [u8; 32],
    pub destination_script_pubkey: Vec<u8>,
    pub amount_sats: u64,
    pub fee_sats: u64,
    pub sighash_type: u8,
}

impl MessageApprovalRequest {
    pub const MAX_DESTINATION_SCRIPT_BYTES: usize = 64;
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 32 + 4 + Self::MAX_DESTINATION_SCRIPT_BYTES + 8 + 8 + 1;
}

#[event]
pub struct PolicyInitialized {
    pub owner: Pubkey,
    pub policy: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct BtcMessageApproved {
    pub owner: Pubkey,
    pub policy: Pubkey,
    pub approval: Pubkey,
    pub bitcoin_sighash: [u8; 32],
    pub amount_sats: u64,
    pub fee_sats: u64,
    pub sighash_type: u8,
}

#[error_code]
pub enum PolicyError {
    #[msg("dWallet public key must be a compressed 33-byte or uncompressed 65-byte secp256k1 key")]
    InvalidDwalletPublicKey,
    #[msg("Destination scriptPubKey is too large for this MVP account layout")]
    DestinationScriptTooLarge,
    #[msg("Only SIGHASH_ALL is supported in this MVP")]
    UnsupportedSighashType,
}

