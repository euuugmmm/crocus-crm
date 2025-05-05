// lib/calculations.js

export function calculateCommission(operator, bruttoClient, bruttoOperator, net) {
    const op = operator ? operator.toString().toLowerCase() : '';
    let commission = 0;
  
    if (op.includes('toco tour ro') || op.includes('toco tour md')) {
      const markup = bruttoClient - net;
      commission = markup > 0 ? markup * 0.8 : 0;
    } else if (op.includes('karpaten') || op.includes('dertour') || op.includes('christian')) {
      const baseCommission = bruttoOperator * 0.03;
      const markup = bruttoClient - bruttoOperator;
      const extraCommission = markup > 0 ? markup * 0.8 : 0;
      commission = baseCommission + extraCommission;
    } else {
      const markup = bruttoClient - net;
      commission = markup > 0 ? markup * 0.8 : 0;
    }
  
    return Math.round(commission * 100) / 100;
  }
  