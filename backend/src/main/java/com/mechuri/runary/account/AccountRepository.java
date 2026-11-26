package com.mechuri.runary.account;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface AccountRepository extends JpaRepository<Account, Long> {
    Optional<Account> findByProviderAndProviderUserId(Account.Provider provider, String providerUserId);
}
