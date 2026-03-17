export interface BankTransferResult {
  success: boolean;
  reference?: string;
  failureReason?: string;
}

export interface BankTransferParams {
  merchantId: string;
  bankAccountId: string;
  amount: number;
  reference: string;
}

export interface BankTransferService {
  transfer(params: BankTransferParams): Promise<BankTransferResult>;
}

export const stubBankTransferService: BankTransferService = {
  async transfer(params) {
    return {
      success: true,
      reference: `stub-${params.reference}-${Date.now()}`,
    };
  },
};
