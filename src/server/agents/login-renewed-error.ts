import type { Provider } from "../../shared/contracts";

export class ModelLoginRenewedError extends Error {
  constructor(readonly provider: Provider) {
    super(`The ${provider} login was renewed during this turn`);
    this.name = "ModelLoginRenewedError";
  }
}
