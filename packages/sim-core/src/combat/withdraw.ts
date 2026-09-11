export interface WithdrawalCheck {
  readonly wantsToWithdraw: boolean;
  readonly escaped: boolean;
  readonly pursued: boolean;
}

/** Spec 9.6: doctrine decides intent; speed and pursueAbove decide contact. */
export function checkWithdrawal(
  lossFraction: number,
  enemyLossFraction: number,
  withdrawAt: number,
  ownSpeed: number,
  enemySpeed: number,
  ownStrength: number,
  enemyStrength: number,
  enemyPursueAbove: number
): WithdrawalCheck {
  const wantsToWithdraw = lossFraction + 1e-9 >= withdrawAt && lossFraction > enemyLossFraction;
  if (!wantsToWithdraw) return { wantsToWithdraw: false, escaped: false, pursued: false };
  const ratio = enemyStrength / Math.max(1e-9, ownStrength);
  const pursued = ratio + 1e-9 >= enemyPursueAbove;
  return {
    wantsToWithdraw: true,
    escaped: !pursued || ownSpeed > enemySpeed,
    pursued
  };
}
