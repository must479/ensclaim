pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;
import "./PublicResolver.sol";

interface ExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns(bytes memory);
}

contract WildcardResolver is PublicResolver, ExtendedResolver {
    constructor(ENS _ens,  INameWrapper wrapperAddress) PublicResolver(_ens, wrapperAddress)  {}
    bytes4 constant public INTERFACE_META_ID = bytes4(keccak256("supportsInterface(bytes4)"));


    function text(bytes32 node, string calldata key) virtual override(TextResolver) external view returns (string memory) {
        return 'google.com';
    }

    // Returns data no matter what name it is;
    function resolve(bytes calldata /* name */, bytes calldata data) override(ExtendedResolver) external view returns (bytes memory) {
        (bool success, bytes memory returnData) = address(this).staticcall(data);
        return returnData;
    }

    function supportsInterface(bytes4 interfaceID) virtual override(PublicResolver) public pure returns (bool) {
        return interfaceID == type(ExtendedResolver).interfaceId || super.supportsInterface(interfaceID);
    }
}

