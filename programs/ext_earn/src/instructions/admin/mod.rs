// ext_earn/instructions/admin/mod.rs

pub mod add_earn_manager;
pub mod add_wrap_authority;
pub mod initialize;
pub mod remove_earn_manager;
pub mod remove_wrap_authority;
pub mod set_earn_authority;
pub mod set_m_mint;

pub use add_earn_manager::AddEarnManager;
pub(crate) use add_earn_manager::__client_accounts_add_earn_manager;
pub use add_wrap_authority::AddWrapAuthority;
pub(crate) use add_wrap_authority::__client_accounts_add_wrap_authority;
pub use initialize::Initialize;
pub(crate) use initialize::__client_accounts_initialize;
pub use remove_earn_manager::RemoveEarnManager;
pub(crate) use remove_earn_manager::__client_accounts_remove_earn_manager;
pub use remove_wrap_authority::RemoveWrapAuthority;
pub(crate) use remove_wrap_authority::__client_accounts_remove_wrap_authority;
pub use set_earn_authority::SetEarnAuthority;
pub(crate) use set_earn_authority::__client_accounts_set_earn_authority;
pub use set_m_mint::SetMMint;
pub(crate) use set_m_mint::__client_accounts_set_m_mint;

cfg_if::cfg_if! {
    if #[cfg(feature = "cpi")] {
        pub(crate) use add_earn_manager::__cpi_client_accounts_add_earn_manager;
        pub(crate) use initialize::__cpi_client_accounts_initialize;
        pub(crate) use remove_earn_manager::__cpi_client_accounts_remove_earn_manager;
        pub(crate) use set_earn_authority::__cpi_client_accounts_set_earn_authority;
        pub(crate) use set_m_mint::__cpi_client_accounts_set_m_mint;
        pub(crate) use add_wrap_authority::__cpi_client_accounts_add_wrap_authority;
        pub(crate) use remove_wrap_authority::__cpi_client_accounts_remove_wrap_authority;
    }
}
