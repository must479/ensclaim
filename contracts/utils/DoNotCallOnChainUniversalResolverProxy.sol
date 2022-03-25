// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./UniversalResolver.sol";
import "../resolvers/Resolver.sol";
import "./NameEncoder.sol";
import "../root/Ownable.sol";

contract DoNotCallOnChainUniversalResolverProxy is Ownable {
    using NameEncoder for string;
    using NameEncoder for bytes;

    UniversalResolver public universalResolver;

    constructor(address _resolver) {
        universalResolver = UniversalResolver(_resolver);
        owner = msg.sender;
    }

    /**
     * @dev Replaces namehashes at given indexes with a replacement namehash.
     * @param replacementHash The replacement namehash.
     * @param data The reference data to replace namehashes in.
     * @param locations The indexes of the namehashes to replace.
     */
    function replaceHashes(
        bytes32 replacementHash,
        bytes memory data,
        uint256[] memory locations
    ) internal pure returns (bytes memory) {
        assembly {
            let offset := add(data, 0x20)
            for {
                let i := 0
            } lt(i, mload(add(locations, 0))) {
                i := add(i, 1)
            } {
                let location := mload(add(locations, add(0x20, mul(i, 0x20))))
                mstore(add(offset, location), replacementHash)
            }
        }
        return data;
    }

    enum ReverseCallDataType {
        universal,
        labelhash,
        namehash
    }

    struct ReverseCall {
        address target;
        bytes data;
        ReverseCallDataType dataType;
        uint256[] locations;
    }

    /**
     * @dev Performs ENS name reverse resolution for the supplied address and resolution data.
     * @param reverseNode The reverse node to resolve, in normalised and DNS-encoded form.
     * @param calls The resolution data encoded as it would be for the universal resolver, using the reverseNode namehash as a replacement for the resolved namehash.
     * @return name
     * @return returnData
     */
    function reverse(bytes memory reverseNode, ReverseCall[] memory calls)
        external
        view
        returns (string memory name, bytes[] memory returnData)
    {
        returnData = new bytes[](calls.length);
        (bytes memory resolvedReverseData, ) = universalResolver.resolve(
            reverseNode,
            abi.encodeCall(INameResolver.name, reverseNode.namehash(0))
        );

        if (resolvedReverseData.length == 0) {
            return ("", new bytes[](0));
        }

        string memory resolvedName = abi.decode(resolvedReverseData, (string));

        if (keccak256(bytes(resolvedName)) == keccak256("")) {
            return ("", new bytes[](0));
        }

        if (calls.length == 0) {
            return (resolvedName, new bytes[](0));
        }

        (bytes memory encodedName, bytes32 namehash) = resolvedName
            .encodeAndHash();

        bytes32 labelhash = 0x0;
        for (uint256 i = 0; i < calls.length; i++) {
            if (calls[i].dataType == ReverseCallDataType.universal) {
                calls[i].data = replaceHashes(
                    namehash,
                    calls[i].data,
                    calls[i].locations
                );
                (, returnData[i]) = address(calls[i].target).staticcall(
                    abi.encodeCall(
                        universalResolver.resolve,
                        (encodedName, calls[i].data)
                    )
                );
                continue;
            }
            if (calls[i].dataType == ReverseCallDataType.namehash) {
                calls[i].data = replaceHashes(
                    namehash,
                    calls[i].data,
                    calls[i].locations
                );
            }
            if (calls[i].dataType == ReverseCallDataType.labelhash) {
                if (labelhash == bytes32(0x0)) {
                    (labelhash, ) = encodedName.readLabel(0);
                }
                calls[i].data = replaceHashes(
                    labelhash,
                    calls[i].data,
                    calls[i].locations
                );
            }
            (, returnData[i]) = address(calls[i].target).staticcall(
                calls[i].data
            );
        }

        return (resolvedName, returnData);
    }

    function setUniversalResolver(address newUniversalResolver)
        public
        onlyOwner
    {
        universalResolver = UniversalResolver(newUniversalResolver);
    }
}
