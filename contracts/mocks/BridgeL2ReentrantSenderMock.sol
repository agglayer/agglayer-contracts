// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.20;

import "../interfaces/IAgglayerBridge.sol";
import "../interfaces/IBridgeMessageReceiver.sol";
import "./ERC20SenderHookMock.sol";

interface IMigrateLegacyToken {
    function migrateLegacyToken(
        address legacyTokenAddress,
        uint256 amount,
        bytes calldata permitData
    ) external;
}

/**
 * @notice Holder of an ERC20SenderHookMock that re-enters the bridge from its `tokensToSend` hook,
 * and that bridges WETH back from `onMessageReceived`
 */
contract BridgeL2ReentrantSenderMock is
    IERC20SenderHook,
    IBridgeMessageReceiver
{
    enum Reentry {
        None,
        BridgeMessageWETH,
        BridgeAsset,
        MigrateLegacyToken
    }

    IAgglayerBridge public immutable bridge;
    Reentry public reentry;
    address public reentryToken;
    uint256 public reentryAmount;
    uint32 public destinationNetwork;
    bool internal _entered;

    constructor(IAgglayerBridge _bridge, uint32 _destinationNetwork) {
        bridge = _bridge;
        destinationNetwork = _destinationNetwork;
    }

    function setup(
        ERC20SenderHookMock token,
        Reentry _reentry,
        address _reentryToken,
        uint256 _reentryAmount
    ) external {
        token.approve(address(bridge), type(uint256).max);
        token.setSenderHook(true);
        reentry = _reentry;
        reentryToken = _reentryToken;
        reentryAmount = _reentryAmount;
        _entered = false;
    }

    function bridgeMessageWETH(uint256 amount) external {
        bridge.bridgeMessageWETH(
            destinationNetwork,
            address(this),
            amount,
            false,
            ""
        );
    }

    function bridgeAsset(address token, uint256 amount) external {
        bridge.bridgeAsset(
            destinationNetwork,
            address(this),
            amount,
            token,
            false,
            ""
        );
    }

    function migrateLegacyToken(address token, uint256 amount) external {
        IMigrateLegacyToken(address(bridge)).migrateLegacyToken(
            token,
            amount,
            ""
        );
    }

    function tokensToSend(address, address, uint256) external {
        if (_entered || reentry == Reentry.None) {
            return;
        }
        _entered = true;
        if (reentry == Reentry.BridgeMessageWETH) {
            this.bridgeMessageWETH(reentryAmount);
        } else if (reentry == Reentry.BridgeAsset) {
            this.bridgeAsset(reentryToken, reentryAmount);
        } else {
            this.migrateLegacyToken(reentryToken, reentryAmount);
        }
    }

    /**
     * @notice Bridges back the WETH received with the message: claimMessage -> onMessageReceived -> bridgeMessageWETH
     */
    function onMessageReceived(
        address,
        uint32,
        bytes memory data
    ) external payable {
        this.bridgeMessageWETH(abi.decode(data, (uint256)));
    }
}
