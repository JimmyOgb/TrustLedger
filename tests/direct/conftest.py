import os
import sys
from pathlib import Path

os.environ.setdefault("GENVM_VERSION", "v0.6.0-rc9")

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import cloudpickle
import gltest.direct.wasi_mock as _wasi_mock
from gltest.direct.sdk_compat import import_calldata

_orig_handle_run_nondet = _wasi_mock._handle_run_nondet


def _capturing_handle_run_nondet(vm, data):
    encoded = _orig_handle_run_nondet(vm, data)
    data_validator = data.get("data_validator")
    data_leader = data.get("data_leader")
    if data_validator and isinstance(encoded, bytes) and len(encoded) > 0 and encoded[0] == 0:
        calldata = import_calldata()
        stored_result = calldata.decode(encoded[1:])
        val_mapped = cloudpickle.loads(data_validator)
        lead_fn = cloudpickle.loads(data_leader)

        def _val_wrapper(wrapped):
            if hasattr(wrapped, "calldata"):
                raw_leader = bytes([0]) + calldata.encode(wrapped.calldata)
            else:
                raw_leader = bytes([1]) + str(wrapped).encode("utf-8")
            vm._in_nondet = True
            try:
                return val_mapped({"leaders_result": raw_leader})
            finally:
                vm._in_nondet = False

        vm._captured_validators.append((stored_result, lambda: lead_fn(None), _val_wrapper))
    return encoded


_wasi_mock._handle_run_nondet = _capturing_handle_run_nondet
